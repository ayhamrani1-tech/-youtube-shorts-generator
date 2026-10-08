"""Background job queue for long renders.

* One job runs at a time (rendering uses the whole CPU/GPU); the rest wait in order.
* Every job is a JSON file in `jobs/` so status survives a bot restart. Jobs that were running when the
  bot stopped are marked `interrupted` and can be retried.
* A job is a command line (normally `node studio/make.mjs episodes/<slug>`). The engine prints
  `PROGRESS <stage> <percent>` lines, which become progress updates.
* Cancel kills the whole process tree (FFmpeg/Edge/Python children included).

This module knows nothing about Discord, so it can be tested offline (tests/test_jobs.py).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import subprocess
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Awaitable, Callable

log = logging.getLogger("fvs.jobs")

QUEUED, RUNNING, DONE, FAILED, CANCELLED, INTERRUPTED = "queued", "running", "done", "failed", "cancelled", "interrupted"
FINAL = {DONE, FAILED, CANCELLED, INTERRUPTED}


@dataclass
class Job:
    id: str
    kind: str                      # e.g. "render", "guess_player"
    title: str                     # human label shown in Discord
    command: list[str]             # what to run
    cwd: str
    owner_id: int = 0              # Discord user who asked
    channel_id: int = 0
    status: str = QUEUED
    stage: str = ""
    percent: int = 0
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    attempts: int = 0
    result: dict = field(default_factory=dict)   # e.g. production report
    error: str = ""                             # short, safe message (no paths)
    log_file: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2)


ProgressCallback = Callable[[Job], Awaitable[None]]


def kill_tree(pid: int) -> None:
    """Stop a process and all its children (Windows: taskkill /T)."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:  # pragma: no cover - not used on the studio PC
        try:
            os.killpg(os.getpgid(pid), signal.SIGKILL)
        except ProcessLookupError:
            pass


class JobQueue:
    def __init__(self, jobs_dir: Path, on_update: ProgressCallback | None = None,
                 result_reader: Callable[[Job], dict] | None = None):
        self.dir = Path(jobs_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.on_update = on_update
        self.result_reader = result_reader       # reads the production report after a run
        self.jobs: dict[str, Job] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._proc: asyncio.subprocess.Process | None = None
        self._current: str | None = None
        self._worker: asyncio.Task | None = None
        self._load()

    # ---------- persistence ----------
    def _path(self, job_id: str) -> Path:
        return self.dir / f"{job_id}.json"

    def save(self, job: Job) -> None:
        tmp = self._path(job.id).with_suffix(".tmp")
        tmp.write_text(job.to_json(), encoding="utf-8")
        tmp.replace(self._path(job.id))

    def _load(self) -> None:
        for f in sorted(self.dir.glob("*.json")):
            try:
                job = Job(**json.loads(f.read_text(encoding="utf-8")))
            except (ValueError, TypeError) as exc:
                log.warning("skipping unreadable job file %s: %s", f.name, exc)
                continue
            if job.status in (RUNNING, QUEUED):  # the bot stopped while this job was pending/running
                job.status, job.error = INTERRUPTED, "the bot was restarted; use retry"
                self.save(job)
            self.jobs[job.id] = job

    # ---------- public API ----------
    def submit(self, kind: str, title: str, command: list[str], cwd: Path, owner_id: int = 0, channel_id: int = 0) -> Job:
        job = Job(id=uuid.uuid4().hex[:8], kind=kind, title=title, command=command, cwd=str(cwd),
                  owner_id=owner_id, channel_id=channel_id)
        job.log_file = str(self.dir / f"{job.id}.log")
        self.jobs[job.id] = job
        self.save(job)
        self._queue.put_nowait(job.id)
        log.info("queued job %s (%s)", job.id, title)
        return job

    def retry(self, job_id: str) -> Job | None:
        job = self.jobs.get(job_id)
        if not job or job.status not in (FAILED, CANCELLED, INTERRUPTED):
            return None
        job.status, job.stage, job.percent, job.error, job.result = QUEUED, "", 0, "", {}
        self.save(job)
        self._queue.put_nowait(job.id)
        return job

    async def cancel(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job or job.status in FINAL:
            return False
        if job.status == QUEUED:
            job.status, job.finished = CANCELLED, time.time()
            self.save(job)
            await self._notify(job)
            return True
        if self._current == job_id and self._proc and self._proc.returncode is None:
            job.status = CANCELLED          # the worker sees this after the process dies
            self.save(job)
            kill_tree(self._proc.pid)
            return True
        return False

    def position(self, job_id: str) -> int:
        """1-based place in the waiting line (0 = running or finished)."""
        waiting = [j for j in self.jobs.values() if j.status == QUEUED]
        waiting.sort(key=lambda j: j.created)
        ids = [j.id for j in waiting]
        return ids.index(job_id) + 1 if job_id in ids else 0

    def start(self) -> None:
        if not self._worker:
            self._worker = asyncio.get_running_loop().create_task(self._run_forever())

    async def stop(self) -> None:
        if self._proc and self._proc.returncode is None:
            kill_tree(self._proc.pid)
        if self._worker:
            self._worker.cancel()

    async def wait_idle(self) -> None:
        """For tests: wait until nothing is queued or running."""
        while any(j.status in (QUEUED, RUNNING) for j in self.jobs.values()):
            await asyncio.sleep(0.05)

    # ---------- worker ----------
    async def _notify(self, job: Job) -> None:
        if self.on_update:
            try:
                await self.on_update(job)
            except Exception:  # a Discord hiccup must never kill the worker
                log.exception("progress callback failed for job %s", job.id)

    async def _run_forever(self) -> None:
        while True:
            job_id = await self._queue.get()
            job = self.jobs.get(job_id)
            if not job or job.status != QUEUED:
                continue
            try:
                await self._run(job)
            except Exception:
                log.exception("job %s crashed", job.id)
                job.status, job.error = FAILED, "internal error (see bot log)"
                self.save(job)
                await self._notify(job)

    async def _run(self, job: Job) -> None:
        job.status, job.started, job.attempts = RUNNING, time.time(), job.attempts + 1
        self._current = job.id
        self.save(job)
        await self._notify(job)
        with open(job.log_file, "a", encoding="utf-8") as logf:
            logf.write(f"\n=== attempt {job.attempts} {time.ctime()} ===\n$ {' '.join(job.command)}\n")
            self._proc = await asyncio.create_subprocess_exec(
                *job.command, cwd=job.cwd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            assert self._proc.stdout
            async for raw in self._proc.stdout:
                line = raw.decode("utf-8", errors="replace").rstrip()
                logf.write(line + "\n")
                if line.startswith("PROGRESS "):
                    parts = line.split()
                    if len(parts) >= 3 and parts[2].isdigit():
                        job.stage, job.percent = parts[1], int(parts[2])
                        self.save(job)
                        await self._notify(job)
            code = await self._proc.wait()
        self._current, self._proc = None, None
        job.finished = time.time()
        if job.status == CANCELLED:
            job.error = "cancelled"
        else:
            job.result = self.result_reader(job) if self.result_reader else {}
            ok = code == 0 and job.result.get("status", "ok") == "ok"
            job.status = DONE if ok else FAILED
            job.percent = 100 if ok else job.percent
            if not ok:
                job.error = "; ".join(job.result.get("errors", [])[:3]) or f"exit code {code}"
        self.save(job)
        log.info("job %s finished: %s", job.id, job.status)
        await self._notify(job)
