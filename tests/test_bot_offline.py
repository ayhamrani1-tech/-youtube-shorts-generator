"""Offline smoke tests for the Discord layer: the bot is built and its commands registered, but it never
connects to Discord and never sends a message."""
import json
from pathlib import Path

from bot import main as botmain
from bot.config import Settings
from bot.research import builder
from tests.test_research import fake_fetch
from bot.research import wikidata, wikipedia


def make_bot(tmp_path):
    s = Settings(token="not-a-real-token", allowed_user_ids={42}, jobs_dir=tmp_path / "jobs", logs_dir=tmp_path / "logs")
    return botmain.StudioBot(s)


def test_all_slash_commands_are_registered(tmp_path):
    bot = make_bot(tmp_path)
    botmain.register_commands(bot)
    names = {c.name for c in bot.tree.get_commands()}
    assert names == {"help", "templates", "episodes", "guess_player", "player_story", "create_video", "goal_quiz",
                     "preview", "job_status", "cancel_job", "retry_job"}


def test_plan_card_lists_stops_checks_and_sources():
    p = wikidata.get_player("Q483837", fetch=fake_fetch)
    draft = builder.transfer_quiz(p, wikipedia.get_infobox(p.enwiki, fetch=fake_fetch))
    text = botmain.plan_text(draft)
    assert "1. دينامو زغرب · 2003" in text and "✅" in text and "wikidata.org" in text
    assert len(text) <= 1900                      # fits in one Discord message


def test_safe_removes_local_paths():
    msg = botmain.safe(r"failed: C:\Users\User\Desktop\FootballVideoStudio\out\x.mp4 missing")
    assert "Users" not in msg and "[path]" in msg


def test_only_allowed_users_pass(tmp_path):
    bot = make_bot(tmp_path)

    class FakeUser:
        def __init__(self, id): self.id = id

    class FakeInteraction:
        def __init__(self, uid): self.user = FakeUser(uid)

    assert botmain.allowed(bot, FakeInteraction(42))
    assert not botmain.allowed(bot, FakeInteraction(7))
