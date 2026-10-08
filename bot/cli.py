"""Command line for the same steps the Discord bot runs, without Discord.

    python -m bot.cli research "Luka Modric" --quiz transfers     # writes episodes/<slug>/ (not approved)
    python -m bot.cli research "Mohamed Salah" --quiz attributes
    python -m bot.cli render luka-modric-transfers                 # approve + run the full pipeline
    python -m bot.cli episodes                                     # list episodes
"""
from __future__ import annotations

import argparse
import subprocess
import sys

from . import pipeline
from .config import load_settings


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m bot.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("research", help="research a player and write an episode draft")
    r.add_argument("name")
    r.add_argument("--quiz", choices=sorted(pipeline.QUIZ_TYPES), default="transfers")
    r.add_argument("--qid", help="Wikidata id, if the name is ambiguous (e.g. Q483837)")
    m = sub.add_parser("render", help="approve an episode and render it")
    m.add_argument("slug")
    m.add_argument("--voice", default=None)
    sub.add_parser("episodes", help="list episodes")
    a = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    if a.cmd == "episodes":
        for e in pipeline.list_episodes():
            print(f"{e['slug']:32} {e['type']:18} {e['title']}")
        return 0
    if a.cmd == "research":
        res = pipeline.research_quiz(a.name, a.quiz, a.qid)
        if res.error:
            print("ERROR:", res.error)
            return 1
        if res.candidates:
            print("Several footballers match — run again with --qid:")
            for c in res.candidates:
                print(f"  {c.qid}  {c.label}  ({c.description})")
            return 2
        d = res.draft
        print(f"Draft written: episodes/{d.slug}/ (not approved)")
        for c in d.checks:
            print(f"  [{c.status}] {c.item} {c.detail}")
        for q in d.questions:
            print("  NEEDS INPUT:", q)
        if d.blocking:
            print("  Disputed facts must be fixed in episode.json before rendering.")
        return 0
    if a.cmd == "render":
        if not pipeline.episode_exists(a.slug):
            print("ERROR: no such episode")
            return 1
        s = load_settings()
        pipeline.approve(a.slug)
        return subprocess.call(pipeline.make_command(s.node, a.slug, a.voice or s.voice))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
