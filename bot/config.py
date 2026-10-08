"""Settings for the Discord bot, read from environment variables or a local `.env` file.

Secrets (the Discord token) are never written to source code or logs. Copy `.env.example` to
`.env` and fill it in; `.env` is ignored by git.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path) -> dict[str, str]:
    """Minimal .env parser: KEY=VALUE lines, `#` comments, optional quotes. No dependency needed."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def _ids(text: str) -> set[int]:
    return {int(x) for x in text.replace(";", ",").split(",") if x.strip().isdigit()}


@dataclass
class Settings:
    token: str = ""
    allowed_user_ids: set[int] = field(default_factory=set)   # who may start jobs (empty = nobody)
    guild_id: int | None = None                               # sync slash commands to one test server (fast)
    max_upload_mb: float = 10.0                               # Discord's default attachment limit
    node: str = "node"
    root: Path = ROOT
    jobs_dir: Path = ROOT / "jobs"
    logs_dir: Path = ROOT / "logs"
    voice: str = "tts"                                        # tts (SILMA) | none (use existing audio)

    @property
    def can_run(self) -> bool:
        return bool(self.token)


def load_settings(env_file: Path | None = None) -> Settings:
    file_values = load_dotenv(env_file or ROOT / ".env")
    get = lambda k, d="": os.environ.get(k, file_values.get(k, d))  # real environment wins over .env
    guild = get("DISCORD_GUILD_ID")
    return Settings(
        token=get("DISCORD_TOKEN"),
        allowed_user_ids=_ids(get("ALLOWED_USER_IDS")),
        guild_id=int(guild) if guild.isdigit() else None,
        max_upload_mb=float(get("MAX_UPLOAD_MB", "10") or 10),
        node=get("NODE_EXE", "node") or "node",
        voice=get("FVS_VOICE", "tts") or "tts",
    )
