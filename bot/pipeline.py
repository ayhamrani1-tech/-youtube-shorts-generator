"""The steps between "a player name" and "an episode folder ready to render". Used by the Discord bot
and by the command line (`python -m bot.cli`). Plain functions, no Discord code.

    name ──search──▶ candidates ──(user picks one if several)──▶ facts (Wikidata) + infobox (Wikipedia)
         ──builder──▶ Draft (episode.json + sources.md, approved = False)
         ──approve──▶ make_command() ──JobQueue──▶ node studio/make.mjs ──▶ out/<slug>.mp4 + report.json
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .config import ROOT
from .research import builder, wikidata, wikipedia
from .research.http import ResearchError

EPISODES = ROOT / "episodes"
QUIZ_TYPES = {"transfers": builder.transfer_quiz, "attributes": builder.attribute_quiz, "story": builder.story_draft}


@dataclass
class ResearchResult:
    draft: builder.Draft | None = None
    candidates: list[wikidata.Candidate] | None = None   # set when the name is ambiguous
    error: str = ""


def research_quiz(name: str, quiz: str, qid: str | None = None) -> ResearchResult:
    """Research a player and write an unapproved episode draft. Stops and returns candidates if ambiguous."""
    try:
        if not qid:
            hits = wikidata.search_footballers(name)
            if not hits:
                return ResearchResult(error=f"No footballer called “{name}” found on Wikidata. Try the full name in English or Arabic.")
            if len(hits) > 1:
                return ResearchResult(candidates=hits)
            qid = hits[0].qid
        facts = wikidata.get_player(qid)
        try:
            box = wikipedia.get_infobox(facts.enwiki) if facts.enwiki else None
        except ResearchError:
            box = None
        if quiz == "story":
            intro = wikipedia.get_intro(facts.enwiki) if facts.enwiki else ""
            draft = builder.story_draft(facts, box, intro)
        else:
            draft = QUIZ_TYPES[quiz](facts, box)
        builder.write_draft(draft, EPISODES)
        return ResearchResult(draft=draft)
    except (ResearchError, ValueError, FileExistsError) as exc:
        return ResearchResult(error=str(exc))


def approve(slug: str) -> None:
    f = EPISODES / slug / "episode.json"
    ep = json.loads(f.read_text(encoding="utf-8"))
    ep.setdefault("generated", {})["approved"] = True
    f.write_text(json.dumps(ep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def list_episodes() -> list[dict]:
    out = []
    for f in sorted(EPISODES.glob("*/episode.json")):
        try:
            ep = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        out.append({"slug": ep.get("slug", f.parent.name), "type": ep.get("type"), "title": ep.get("title_ar") or ep.get("subject", {}).get("name_ar", "")})
    return out


def episode_exists(slug: str) -> bool:
    return (EPISODES / slug / "episode.json").exists() and "/" not in slug and "\\" not in slug and ".." not in slug


def make_command(node: str, slug: str, voice: str = "tts", skip_render: bool = False) -> list[str]:
    cmd = [node, str(ROOT / "studio" / "make.mjs"), str(EPISODES / slug), "--voice", voice]
    return cmd + (["--skip-render"] if skip_render else [])


def read_report(slug: str) -> dict:
    f = EPISODES / slug / "build" / "report.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
