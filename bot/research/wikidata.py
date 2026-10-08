"""Structured football facts from Wikidata (free, no API key).

What it extracts for a player:
  * Arabic and English names, birth date
  * nationality for sport (P1532, falling back to citizenship P27)
  * positions (P413)
  * club spells (P54) with start/end years, loans (P1642 = Q2914547) and shirt numbers (P1618)
National and youth teams are removed: a spell is kept only if the team is a football club (see is_club).

Every result carries the entity URLs it came from and the retrieval date, so it can be written into sources.md.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from .http import ResearchError, fetch_json

API = "https://www.wikidata.org/w/api.php"
FOOTBALLER = "Q937857"   # occupation: association football player
CLUB = "Q476028"         # instance of: association football club
CLUB_TYPES = {CLUB, "Q103229495"}   # + "men's association football team" (e.g. Chelsea F.C. has only this one)
NATIONAL_TYPES = {"Q6979593", "Q135408445", "Q23901123", "Q23901137", "Q6979740"}  # national / youth national teams


def is_club(entity: dict) -> bool:
    types = set(_item_ids(entity.get("claims", {}), "P31"))
    name = _label(entity, "en").lower()
    return bool(types & CLUB_TYPES) and not (types & NATIONAL_TYPES) and "national" not in name
LOAN = "Q2914547"        # acquisition transaction: loan


@dataclass
class Candidate:
    qid: str
    label: str
    description: str


@dataclass
class ClubSpell:
    qid: str
    name_ar: str
    name_en: str
    start: int | None
    end: int | None
    loan: bool = False
    shirt: str | None = None
    enwiki: str | None = None      # English Wikipedia title, used for cross-checking
    preferred: bool = False
    source: str = "wikidata"       # "wikipedia" = added from the infobox because Wikidata lacks it (single source)


@dataclass
class PlayerFacts:
    qid: str
    name_ar: str
    name_en: str
    birth: str | None
    nationality_ar: str
    nationality_en: str
    positions_ar: list[str]
    positions_en: list[str]
    spells: list[ClubSpell]
    enwiki: str | None
    excluded: list[str] = field(default_factory=list)       # teams dropped (national/youth), for transparency
    retrieved: str = field(default_factory=lambda: dt.date.today().isoformat())

    @property
    def url(self) -> str:
        return f"https://www.wikidata.org/wiki/{self.qid}"

    def current_club(self) -> ClubSpell | None:
        open_spells = [s for s in self.spells if s.end is None and not s.loan] or [s for s in self.spells if s.end is None]
        if not open_spells:
            return None
        return sorted(open_spells, key=lambda s: (s.preferred, s.start or 0))[-1]


# ---------- low-level helpers ----------
def _entities(ids: list[str], props: str, fetch=fetch_json) -> dict:
    out: dict = {}
    for i in range(0, len(ids), 50):  # API limit: 50 ids per request
        data = fetch(API, {"action": "wbgetentities", "ids": "|".join(ids[i:i + 50]), "props": props, "languages": "ar|en"})
        if "error" in data:
            raise ResearchError(f"Wikidata error: {data['error'].get('info', 'unknown')}")
        out.update(data.get("entities", {}))
    return out


def _label(entity: dict, lang: str) -> str:
    return entity.get("labels", {}).get(lang, {}).get("value", "")


def _item_ids(claims: dict, prop: str) -> list[str]:
    ids = []
    for c in claims.get(prop, []):
        if c.get("rank") == "deprecated":
            continue
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v:
            ids.append(v["id"])
    return ids


def _year(snaks: list) -> int | None:
    for s in snaks or []:
        t = s.get("datavalue", {}).get("value", {}).get("time")
        if t:
            return int(t[1:5])
    return None


# ---------- public ----------
def search_footballers(name: str, fetch=fetch_json) -> list[Candidate]:
    """Find footballers matching a name typed in Arabic or English. Several results = ambiguous: ask the user."""
    ids: list[str] = []
    for lang in ("ar", "en"):
        data = fetch(API, {"action": "wbsearchentities", "search": name, "language": lang, "uselang": lang, "type": "item", "limit": 7})
        for hit in data.get("search", []):
            if hit["id"] not in ids:
                ids.append(hit["id"])
    if not ids:
        return []
    ents = _entities(ids, "claims|labels|descriptions", fetch)
    out = []
    for qid in ids:
        e = ents.get(qid, {})
        if FOOTBALLER in _item_ids(e.get("claims", {}), "P106"):
            desc = e.get("descriptions", {}).get("en", {}).get("value", "")
            out.append(Candidate(qid, _label(e, "ar") or _label(e, "en"), desc))
    return out


def get_player(qid: str, fetch=fetch_json) -> PlayerFacts:
    e = _entities([qid], "claims|labels|sitelinks", fetch).get(qid)
    if not e or "claims" not in e:
        raise ResearchError(f"{qid} not found on Wikidata")
    claims = e["claims"]
    country_ids = _item_ids(claims, "P1532") or _item_ids(claims, "P27")
    pos_ids = _item_ids(claims, "P413")
    team_claims = [c for c in claims.get("P54", []) if c.get("rank") != "deprecated" and "datavalue" in c.get("mainsnak", {})]
    team_ids = sorted({c["mainsnak"]["datavalue"]["value"]["id"] for c in team_claims})  # sorted: stable requests (cache, tests)
    others = _entities(team_ids + country_ids[:1] + pos_ids, "claims|labels|sitelinks", fetch)

    spells, excluded = [], []
    for c in team_claims:
        tid = c["mainsnak"]["datavalue"]["value"]["id"]
        team = others.get(tid, {})
        name_en, name_ar = _label(team, "en"), _label(team, "ar")
        if not is_club(team):
            excluded.append(name_en or tid)
            continue
        q = c.get("qualifiers", {})
        loan = any(s.get("datavalue", {}).get("value", {}).get("id") == LOAN for s in q.get("P1642", []))
        shirt = next((s["datavalue"]["value"] for s in q.get("P1618", []) if "datavalue" in s), None)
        spells.append(ClubSpell(tid, name_ar, name_en, _year(q.get("P580")), _year(q.get("P582")), loan,
                                str(shirt) if shirt is not None else None,
                                team.get("sitelinks", {}).get("enwiki", {}).get("title"), c.get("rank") == "preferred"))
    spells.sort(key=lambda s: (s.start or 9999, s.loan))
    birth = next((c["mainsnak"]["datavalue"]["value"]["time"][1:11] for c in claims.get("P569", []) if "datavalue" in c["mainsnak"]), None)
    country = others.get(country_ids[0], {}) if country_ids else {}
    return PlayerFacts(
        qid=qid, name_ar=_label(e, "ar"), name_en=_label(e, "en"), birth=birth,
        nationality_ar=_label(country, "ar"), nationality_en=_label(country, "en"),
        positions_ar=[_label(others.get(p, {}), "ar") for p in pos_ids if _label(others.get(p, {}), "ar")],
        positions_en=[_label(others.get(p, {}), "en") for p in pos_ids],
        spells=spells, enwiki=e.get("sitelinks", {}).get("enwiki", {}).get("title"), excluded=sorted(set(excluded)))


def add_infobox_only_clubs(facts: PlayerFacts, box, fetch=fetch_json) -> list[ClubSpell]:
    """Clubs listed in the Wikipedia infobox but missing on Wikidata (e.g. De Bruyne's Chelsea spell).
    They are added as single-source spells; their Arabic names come from Wikidata via the English article title."""
    if not box:
        return []
    known = {s.enwiki for s in facts.spells if s.enwiki}
    missing = [c for c in box.clubs if c.title not in known and not any(
        s.name_en.lower().startswith(c.shown.replace(" (loan)", "").lower()) for s in facts.spells)]
    if not missing:
        return []
    titles = sorted({c.title for c in missing})
    data = fetch(API, {"action": "wbgetentities", "sites": "enwiki", "titles": "|".join(titles[:50]), "props": "labels|sitelinks|claims", "languages": "ar|en"})
    by_title = {}
    for qid, e in data.get("entities", {}).items():
        t = e.get("sitelinks", {}).get("enwiki", {}).get("title")
        if t and is_club(e):
            by_title[t] = (qid, _label(e, "ar"), _label(e, "en"))
    added = []
    for c in missing:
        if c.title not in by_title:
            continue  # not a club (or unknown): leave it as a warning only
        qid, ar, en = by_title[c.title]
        spell = ClubSpell(qid, ar, en or c.shown, c.start, c.end, c.loan, None, c.title, False, "wikipedia")
        facts.spells.append(spell)
        added.append(spell)
    facts.spells.sort(key=lambda s: (s.start or 9999, s.loan))
    return added
