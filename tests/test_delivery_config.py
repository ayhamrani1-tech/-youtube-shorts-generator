"""Offline tests: upload-size handling and settings/.env parsing (no Discord, no secrets)."""
from pathlib import Path

from bot import delivery
from bot.config import load_dotenv, load_settings


def test_small_file_is_sent_as_is(tmp_path):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"0" * 1024)
    d = delivery.plan_delivery(f, limit_mb=10)
    assert d.file == f and not d.is_preview


def test_big_file_gets_a_preview_that_fits(tmp_path, monkeypatch):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"0" * (12 * 1024 * 1024))
    monkeypatch.setattr(delivery, "probe_duration", lambda v: 60.0)
    made = {}
    d = delivery.plan_delivery(f, limit_mb=10, make_preview=lambda src, dst, kbps: made.update(kbps=kbps))
    assert d.is_preview and d.file.name.endswith(".discord-preview.mp4")
    assert (made["kbps"] + 96) * 60 / 8 / 1024 < 10          # estimated size under the limit
    assert str(tmp_path) not in d.note                         # never leak local paths


def test_very_long_video_is_not_sent(tmp_path, monkeypatch):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"0" * (400 * 1024 * 1024))
    monkeypatch.setattr(delivery, "probe_duration", lambda v: 1200.0)
    d = delivery.plan_delivery(f, limit_mb=10)
    assert d.file is None and "studio PC" in d.note


def test_dotenv_parsing_and_environment_override(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text('# comment\nDISCORD_TOKEN="abc"\nALLOWED_USER_IDS=1, 2;3\nMAX_UPLOAD_MB=25\n', encoding="utf-8")
    assert load_dotenv(env)["DISCORD_TOKEN"] == "abc"
    monkeypatch.delenv("DISCORD_TOKEN", raising=False)
    s = load_settings(env)
    assert s.token == "abc" and s.allowed_user_ids == {1, 2, 3} and s.max_upload_mb == 25
    monkeypatch.setenv("DISCORD_TOKEN", "from-env")
    assert load_settings(env).token == "from-env"


def test_missing_env_means_bot_cannot_run(tmp_path, monkeypatch):
    monkeypatch.delenv("DISCORD_TOKEN", raising=False)
    monkeypatch.delenv("ALLOWED_USER_IDS", raising=False)
    s = load_settings(tmp_path / "nope.env")
    assert not s.can_run and s.allowed_user_ids == set()
