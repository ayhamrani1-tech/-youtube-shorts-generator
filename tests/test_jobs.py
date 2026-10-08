"""Offline tests for the job queue: no Discord, no rendering. A tiny Python script stands in for the engine."""
import asyncio
import json
import sys
from pathlib import Path

import pytest

from bot.jobs import CANCELLED, DONE, FAILED, INTERRUPTED, QUEUED, Job, JobQueue

FAKE_ENGINE = """
import sys, time
steps = int(sys.argv[1]); pause = float(sys.argv[2]); code = int(sys.argv[3])
for i in range(steps):
    print(f"PROGRESS stage{i} {int(100 * (i + 1) / steps)}", flush=True)
    time.sleep(pause)
sys.exit(code)
"""


@pytest.fixture
def engine(tmp_path: Path) -> Path:
    f = tmp_path / "fake_engine.py"
    f.write_text(FAKE_ENGINE)
    return f


def cmd(engine: Path, steps=3, pause=0.01, code=0):
    return [sys.executable, str(engine), str(steps), str(pause), str(code)]


def run(coro):
    return asyncio.run(coro)


def test_job_runs_and_reports_progress(tmp_path, engine):
    async def main():
        seen = []
        async def on_update(job):
            seen.append((job.status, job.stage, job.percent))
        q = JobQueue(tmp_path / "jobs", on_update=on_update)
        q.start()
        job = q.submit("render", "test", cmd(engine), tmp_path)
        await asyncio.wait_for(q.wait_idle(), 20)
        await q.stop()
        return job, seen
    job, seen = run(main())
    assert job.status == DONE and job.percent == 100
    assert ("running", "stage2", 100) in seen
    saved = json.loads((tmp_path / "jobs" / f"{job.id}.json").read_text())
    assert saved["status"] == DONE


def test_failed_exit_code_marks_job_failed(tmp_path, engine):
    async def main():
        q = JobQueue(tmp_path / "jobs")
        q.start()
        job = q.submit("render", "bad", cmd(engine, code=1), tmp_path)
        await asyncio.wait_for(q.wait_idle(), 20)
        await q.stop()
        return job
    job = run(main())
    assert job.status == FAILED and "exit code 1" in job.error


def test_report_status_failed_overrides_exit_code(tmp_path, engine):
    async def main():
        q = JobQueue(tmp_path / "jobs", result_reader=lambda j: {"status": "failed", "errors": ["check failed: duration"]})
        q.start()
        job = q.submit("render", "x", cmd(engine), tmp_path)
        await asyncio.wait_for(q.wait_idle(), 20)
        await q.stop()
        return job
    job = run(main())
    assert job.status == FAILED and "duration" in job.error


def test_cancel_running_job_kills_process(tmp_path, engine):
    async def main():
        q = JobQueue(tmp_path / "jobs")
        q.start()
        job = q.submit("render", "slow", cmd(engine, steps=50, pause=0.2), tmp_path)
        while job.status != "running" or job.percent == 0:
            await asyncio.sleep(0.05)
        assert await q.cancel(job.id)
        await asyncio.wait_for(q.wait_idle(), 20)
        await q.stop()
        return job
    job = run(main())
    assert job.status == CANCELLED and job.percent < 100


def test_jobs_run_one_at_a_time_in_order(tmp_path, engine):
    async def main():
        order = []
        async def on_update(job):
            if job.status == "running" and job.id not in order:
                order.append(job.id)
        q = JobQueue(tmp_path / "jobs", on_update=on_update)
        a = q.submit("render", "a", cmd(engine), tmp_path)
        b = q.submit("render", "b", cmd(engine), tmp_path)
        assert q.position(b.id) == 2
        q.start()
        await asyncio.wait_for(q.wait_idle(), 20)
        await q.stop()
        return order, a, b
    order, a, b = run(main())
    assert order == [a.id, b.id]


def test_restart_marks_unfinished_jobs_interrupted_and_retry_works(tmp_path, engine):
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir()
    stale = Job(id="abc12345", kind="render", title="old", command=cmd(engine), cwd=str(tmp_path), status="running")
    stale.log_file = str(jobs_dir / "abc12345.log")
    (jobs_dir / "abc12345.json").write_text(stale.to_json())

    async def main():
        q = JobQueue(jobs_dir)
        assert q.jobs["abc12345"].status == INTERRUPTED
        assert q.retry("abc12345").status == QUEUED
        q.start()
        await asyncio.wait_for(q.wait_idle(), 20)
        await q.stop()
        return q.jobs["abc12345"]
    assert run(main()).status == DONE
