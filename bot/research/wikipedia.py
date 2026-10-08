"""Second source: the player's English Wikipedia infobox (free). Used to cross-check Wikidata.

Reads the `{{Infobox football biography}}` fields: years1/clubs1 … yearsN/clubsN (senior career),
current_club, club_number and position.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .http import ResearchError, fetch_json

API = "https://en.wikipedia.org/w/api.php"


@dataclass
class InfoboxClub:
    title: str          # link target, e.g. "GNK Dinamo Zagreb"
    shown: str          # displayed text
    start: int | None
    end: int | None     # None = still there
    loan: bool


@dataclass
class Infobox:
    page: str
    clubs: list[InfoboxClub] = field(default_factory=list)
    current_club: str | None = None
    club_number: str | None = None
    position: str | None = None

    @property
    def url(self) -> str:
        return "https://en.wikipedia.org/wiki/" + self.page.replace(" ", "_")


LINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]")


def _field(text: str, name: str) -> str | None:
    m = re.search(rf"^\s*\|\s*{name}\s*=\s*(.*)$", text, re.M)
    return m.group(1).strip() if m else None


def _plain(value: str) -> str:
    value = re.sub(r"<ref[^>]*/>|<ref.*?</ref>|<!--.*?-->", "", value, flags=re.S)
    value = LINK.sub(lambda m: m.group(2) or m.group(1), value)
    return re.sub(r"\{\{[^{}]*\}\}|'''?|<[^>]+>", "", value).strip()


def _years(value: str) -> tuple[int | None, int | None]:
    nums = [int(y) for y in re.findall(r"(?:18|19|20)\d\d", value)]
    if not nums:
        return None, None
    open_ended = bool(re.search(r"[–-]\s*$", _plain(value)))
    return nums[0], (None if open_ended else nums[-1])


def parse_infobox(page: str, wikitext: str) -> Infobox:
    box = Infobox(page)
    for i in range(1, 40):
        clubs, years = _field(wikitext, f"clubs{i}"), _field(wikitext, f"years{i}")
        if clubs is None:
            break
        link = LINK.search(clubs)
        start, end = _years(years or "")
        box.clubs.append(InfoboxClub(link.group(1).strip() if link else _plain(clubs), _plain(clubs).lstrip("→ ").strip(),
                                     start, end, "loan" in clubs.lower() or "→" in clubs))
    cur = _field(wikitext, "current_club") or _field(wikitext, "currentclub")
    if cur:
        link = LINK.search(cur)
        box.current_club = link.group(1).strip() if link else _plain(cur)
    num = _field(wikitext, "club_number") or _field(wikitext, "clubnumber")
    box.club_number = _plain(num) if num else None
    pos = _field(wikitext, "position")
    box.position = _plain(pos) if pos else None
    return box


def get_infobox(page: str, fetch=fetch_json) -> Infobox:
    data = fetch(API, {"action": "parse", "page": page, "prop": "wikitext", "section": 0, "redirects": 1})
    if "error" in data:
        raise ResearchError(f"Wikipedia: {data['error'].get('info', 'page not found')}")
    return parse_infobox(data["parse"]["title"], data["parse"]["wikitext"]["*"])


def get_intro(page: str, fetch=fetch_json) -> str:
    """Plain-text lead section of the English article (research pack for writing a documentary)."""
    data = fetch(API, {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "titles": page, "redirects": 1})
    pages = data.get("query", {}).get("pages", {})
    return next(iter(pages.values()), {}).get("extract", "") if pages else ""
