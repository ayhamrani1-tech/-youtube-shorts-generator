"""Turn researched facts into an editable episode (episode.json + research.md).

Nothing is rendered here. The bot shows the plan; you approve it (or edit episode.json) before rendering.
Every on-screen fact has a status:
  verified       Wikidata and Wikipedia agree
  single-source  only one of them has it (shown as a warning)
  disputed       they disagree (blocks automatic rendering until you choose)
"""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from .arabic import COUNT_F, ORDINAL_F, number_words
from .wikidata import ClubSpell, PlayerFacts
from .wikipedia import Infobox

POSITION_AR = {  # Wikipedia's English position wording → short Arabic for the screen
    "goalkeeper": "حارس مرمى", "centre-back": "قلب دفاع", "center-back": "قلب دفاع", "full-back": "ظهير", "right-back": "ظهير أيمن",
    "left-back": "ظهير أيسر", "defender": "مدافع", "defensive midfielder": "وسط دفاعي", "central midfielder": "وسط",
    "attacking midfielder": "وسط هجومي", "midfielder": "وسط", "right winger": "جناح أيمن", "left winger": "جناح أيسر",
    "winger": "جناح", "forward": "مهاجم", "striker": "مهاجم صريح", "centre-forward": "رأس حربة", "center-forward": "رأس حربة",
}


@dataclass
class Check:
    item: str
    status: str            # verified | single-source | disputed
    detail: str = ""


@dataclass
class Draft:
    slug: str
    episode: dict
    checks: list[Check] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)   # things the user must answer before rendering
    research: str = ""                                     # research pack text (documentaries)

    @property
    def blocking(self) -> list[Check]:
        return [c for c in self.checks if c.status == "disputed"]


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()  # Modrić → Modric
    s = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return s or "player"


def _norm(name: str) -> str:
    return re.sub(r"\b(f\.?c\.?|cf|club de fútbol|football club|a\.?c\.?|s\.?s\.?c\.?)\b|[^\w]", "", name.lower())


def cross_check(facts: PlayerFacts, box: Infobox | None) -> list[Check]:
    checks = []
    for s in facts.spells:
        label = f"{s.name_en} {s.start}–{s.end or 'now'}{' (loan)' if s.loan else ''}"
        if not box:
            checks.append(Check(label, "single-source", "Wikipedia infobox unavailable"))
            continue
        if s.source == "wikipedia":
            checks.append(Check(label, "single-source", "only on Wikipedia (missing on Wikidata) — included, please confirm"))
            continue
        same = [c for c in box.clubs if (s.enwiki and c.title == s.enwiki) or _norm(c.title) == _norm(s.name_en)
                or _norm(c.shown) == _norm(s.name_en)]
        # a club can appear several times (e.g. a later loan back): compare with the closest spell, same loan status first
        match = min(same, key=lambda c: (c.loan != s.loan, abs((c.start or 0) - (s.start or 0)))) if same else None
        if not match:
            checks.append(Check(label, "single-source", "not in the Wikipedia senior-career list"))
        elif (match.start and s.start and abs(match.start - s.start) > 1) or ((match.end or 0) != (s.end or 0) and abs((match.end or 9999) - (s.end or 9999)) > 1):
            checks.append(Check(label, "disputed", f"Wikipedia says {match.start}–{match.end or 'now'}"))
        else:
            checks.append(Check(label, "verified"))
    if box:
        known = {s.enwiki for s in facts.spells} | {_norm(s.name_en) for s in facts.spells}
        for c in box.clubs:
            if c.title not in known and _norm(c.title) not in known and _norm(c.shown) not in known:
                checks.append(Check(f"{c.shown} {c.start}–{c.end or 'now'}", "single-source", "only on Wikipedia (not used)"))
    return checks


def stops_from_spells(spells: list[ClubSpell]) -> list[dict]:
    """Chronological stops. A spell that contains loans is split: first stay → loans → '(العودة)'."""
    parents = [s for s in spells if not s.loan]
    loans = [s for s in spells if s.loan]
    stops = []
    for p in parents:
        inner = [l for l in loans if p.start and l.start and p.start <= l.start and (p.end is None or (l.end or l.start) <= p.end)]
        stops.append({"club": p.name_ar or p.name_en, "start": p.start, "end": (inner[0].start if inner else p.end), "kind": "club", "first_of_split": bool(inner)})
        for l in inner:
            stops.append({"club": l.name_ar or l.name_en, "start": l.start, "end": l.end, "kind": "loan"})
            loans.remove(l)
        if inner and (p.end is None or (inner[-1].end or 0) < p.end):
            stops.append({"club": p.name_ar or p.name_en, "start": inner[-1].end, "end": p.end, "kind": "return"})
    for l in loans:  # loans not inside a parent spell
        stops.append({"club": l.name_ar or l.name_en, "start": l.start, "end": l.end, "kind": "loan"})
    stops.sort(key=lambda s: (s["start"] or 0, {"club": 0, "loan": 1, "return": 2}[s["kind"]]))
    return stops


def _years(start, end, single=False) -> str:
    if single or start == end:
        return str(start)
    return f"{start} – {end}" if end else f"{start} – الآن"


def transfer_quiz(facts: PlayerFacts, box: Infobox | None) -> Draft:
    checks = cross_check(facts, box)
    stops = stops_from_spells(facts.spells)
    questions = []
    if len(stops) > 9:
        stops = [s for s in stops if s["kind"] != "loan"]
        questions.append("More than 9 stops: loans were left out. Edit episode.json to choose others.")
    if len(stops) < 2:
        raise ValueError("fewer than 2 club stops found — this player cannot be used for a transfer quiz")
    missing_ar = sorted({s["club"] for s in stops if not re.search(r"[؀-ۿ]", s["club"])})
    if missing_ar:
        questions.append("No Arabic club name on Wikidata for: " + ", ".join(missing_ar) + " — add Arabic names in episode.json.")
    data_stops = []
    for i, s in enumerate(stops):
        tag = {"loan": " (إعارة)", "return": " (العودة)"}.get(s["kind"], "")
        single = s["kind"] == "club" and s.get("first_of_split")
        years = _years(s["start"], s["end"], single)
        when = f"عام {number_words(s['start'])}" if s["start"] else ""
        say = {"loan": f"أُعير إلى {s['club']}، {when}.",
               "return": f"عاد إلى {s['club']}، {when}.",
               "club": f"{'بدأ مسيرته مع' if i == 0 else 'انتقل إلى'} {s['club']}، {when}."}[s["kind"]]
        data_stops.append({"club": s["club"], "row": s["club"] + tag, "years": years,
                           "note": {"loan": "إعارة", "return": "العودة"}.get(s["kind"], "أول محطة" if i == 0 else ""),
                           "narration": f"المحطة {ORDINAL_F[i]}: {say}"})
    name = facts.name_ar or facts.name_en
    slug = slugify(facts.name_en) + "-transfers"
    episode = {
        "schema": "fvs/1", "type": "transfer-history", "slug": slug,
        "subject": {"name_ar": name, "name_en": facts.name_en, "wikidata": facts.qid},
        "language": "ar", "orientation": "portrait", "width": 1080, "height": 1920, "fps": 30, "targetSeconds": [30, 90],
        "voice": {"engine": "clipchamp", "status": "pending", "auto": "silma"},
        "generated": {"by": "bot/research", "retrieved": facts.retrieved, "approved": False},
        "sources": "sources.md",
        "data": {
            "header": "خمّن اللاعب من انتقالاته",
            "canvaPages": None,
            "hook": {"kicker": "تحدّي", "title": "خمّن اللاعب من انتقالاته", "subtitle": f"{COUNT_F[len(data_stops)]}… لاعب واحد",
                     "narration": f"خمّن اللاعب من انتقالاته. {COUNT_F[len(data_stops)]}، ولاعب واحد."},
            "stops": data_stops,
            "answer": {"name": name, "sub": facts.nationality_ar, "photo": None, "credit": ""},
            "reveal": {"narration": f"إنه {name}!"},
            "outro": {"title": "هل عرفته قبل العدّ؟", "subtitle": "اكتب في التعليقات", "narration": "هل عرفته قبل نهاية العد؟ اكتب في التعليقات."},
        },
    }
    return Draft(slug, episode, checks, _sources(facts, box), questions)


def attribute_quiz(facts: PlayerFacts, box: Infobox | None) -> Draft:
    cur = facts.current_club()
    checks, questions = [], []
    if not cur:
        raise ValueError("no current club on Wikidata — the attribute quiz needs one")
    box_club = box.current_club if box else None
    club_ok = bool(box_club and ((cur.enwiki and box_club == cur.enwiki) or _norm(box_club) == _norm(cur.name_en)))
    checks.append(Check(f"current club {cur.name_en}", "verified" if club_ok else ("disputed" if box_club else "single-source"),
                        "" if club_ok else f"Wikipedia: {box_club}"))
    number = cur.shirt or (box.club_number if box else None)
    if cur.shirt and box and box.club_number and cur.shirt != box.club_number:
        checks.append(Check("shirt number", "disputed", f"Wikidata {cur.shirt}, Wikipedia {box.club_number}"))
    elif number:
        checks.append(Check(f"shirt number {number}", "verified" if (cur.shirt and box and box.club_number) else "single-source"))
    else:
        questions.append("Shirt number not found in either source — add it in episode.json.")
    pos_en = (box.position if box and box.position else (facts.positions_en[0] if facts.positions_en else "")).split(",")[0].split("/")[0].strip()
    pos_ar = POSITION_AR.get(pos_en.lower()) or (facts.positions_ar[0] if facts.positions_ar else "")
    checks.append(Check(f"position {pos_en}", "verified" if (facts.positions_en and box and box.position) else "single-source"))
    checks.append(Check(f"nationality {facts.nationality_en}", "single-source", "Wikidata (sporting nationality)"))
    if not pos_ar:
        questions.append("No Arabic position name — add it in episode.json.")
    name = facts.name_ar or facts.name_en
    as_of = f"المعلومات حسب {facts.retrieved}"
    attrs = [{"label": "الجنسية", "value": facts.nationality_ar, "narration": f"المعلومة الأولى: من {facts.nationality_ar}."},
             {"label": "النادي", "value": cur.name_ar or cur.name_en, "narration": f"الثانية: يلعب في {cur.name_ar or cur.name_en}."}]
    if number:
        attrs.append({"label": "رقم القميص", "value": number, "size": 140,
                      "narration": f"الثالثة: يرتدي القميص رقم {number_words(int(number)) if number.isdigit() else number}."})
    attrs.append({"label": "المركز", "value": pos_ar, "narration": f"و{'الرابعة' if number else 'الثالثة'}: يلعب في مركز {pos_ar}."})
    slug = slugify(facts.name_en) + "-attributes"
    episode = {
        "schema": "fvs/1", "type": "guess-attributes", "slug": slug,
        "subject": {"name_ar": name, "name_en": facts.name_en, "wikidata": facts.qid},
        "language": "ar", "orientation": "portrait", "width": 1080, "height": 1920, "fps": 30, "targetSeconds": [25, 60],
        "voice": {"engine": "clipchamp", "status": "pending", "auto": "silma"},
        "generated": {"by": "bot/research", "retrieved": facts.retrieved, "approved": False},
        "sources": "sources.md",
        "data": {
            "header": "خمّن اللاعب من معلوماته", "asOf": as_of,
            "hook": {"kicker": "تحدّي", "title": f"{len(attrs)} معلومات… لاعب واحد", "subtitle": "هل تعرفه قبل نهاية العدّ؟",
                     "narration": "معلومات قليلة عن لاعب واحد. هل تعرفه قبل نهاية العد؟"},
            "attributes": attrs,
            "answer": {"name": name, "sub": f"{cur.name_ar or cur.name_en} · {facts.nationality_ar}", "detail": ""},
            "reveal": {"narration": f"إنه {name}!"},
            "outro": {"kicker": "دورك", "title": "كم معلومة احتجت؟", "subtitle": "اكتب رقمها في التعليقات", "narration": "كم معلومة احتجت لتعرفه؟ اكتب رقمها في التعليقات."},
        },
    }
    return Draft(slug, episode, checks, _sources(facts, box), questions)


def story_draft(facts: PlayerFacts, box: Infobox | None, intro_en: str = "") -> Draft:
    """Semi-automatic documentary: a short, renderable skeleton built only from verified data (intro, club
    timeline, current club, end) plus a research pack. Chapters with real storytelling are written by you
    (or Claude Code) in episode.json — the bot never invents narrative claims."""
    checks = cross_check(facts, box)
    stops = stops_from_spells(facts.spells)
    name = facts.name_ar or facts.name_en
    items = [{"year": _years(s["start"], s["end"], s["kind"] == "club" and s.get("first_of_split")),
              "text": s["club"] + {"loan": " (إعارة)", "return": " (العودة)"}.get(s["kind"], "")} for s in stops]
    per = -(-len(items) // -(-len(items) // 5))                          # ≤ 5 rows per slide, split evenly (6 → 3 + 3)
    chunks = [items[i:i + per] for i in range(0, len(items), per)]
    scenes = [{"layout": "timeline", "heading": "محطات المسيرة" + (f" ({k + 1})" if len(chunks) > 1 else ""), "seconds": 8,
               "highlight": len(c) - 1, "items": c,
               "narration": "، ثم ".join(f"{x['text'].replace(' (إعارة)', ' على سبيل الإعارة').replace(' (العودة)', ' مرة أخرى')}"
                                       for x in c) + "."} for k, c in enumerate(chunks)]
    cur = facts.current_club()
    if cur:
        scenes.append({"layout": "fact", "value": cur.name_ar or cur.name_en, "label": "النادي الحالي",
                       "note": f"حسب ويكي بيانات، {facts.retrieved}", "seconds": 6,
                       "narration": f"ويلعب حاليًا مع {cur.name_ar or cur.name_en}."})
    slug = slugify(facts.name_en) + "-story"
    episode = {
        "schema": "fvs/1", "type": "story", "slug": slug, "title_ar": f"قصة {name}",
        "subject": {"name_ar": name, "name_en": facts.name_en, "wikidata": facts.qid},
        "language": "ar", "orientation": "landscape", "width": 1920, "height": 1080, "fps": 30, "targetSeconds": [20, 1200],
        "voice": {"engine": "clipchamp", "status": "pending", "auto": "silma"},
        "generated": {"by": "bot/research", "retrieved": facts.retrieved, "approved": False,
                      "note": "Skeleton from verified data only. Add chapters (with sources) before publishing."},
        "sources": "sources.md",
        "data": {
            "intro": {"kicker": "قصة لاعب", "title": name, "subtitle": facts.nationality_ar, "seconds": 5,
                      "narration": f"هذه قصة {name}."},
            "chapters": [{"title": "المسيرة", "subtitle": "من نادٍ إلى نادٍ", "narration": "الفصل الأول: المسيرة.", "scenes": scenes}],
            "end": {"title": f"ما أجمل محطة في مسيرة {name}؟", "cta": "اكتب رأيك في التعليقات", "seconds": 5,
                    "narration": "ما أجمل محطة في مسيرته؟ اكتب رأيك في التعليقات."},
        },
    }
    d = Draft(slug, episode, checks, _sources(facts, box),
              ["This is a skeleton. Write the story chapters in episode.json (see narration/RESEARCH.md)."])
    d.research = intro_en
    return d


def _sources(facts: PlayerFacts, box: Infobox | None) -> list[str]:
    out = [f"Wikidata {facts.qid}: {facts.url} (retrieved {facts.retrieved})"]
    if box:
        out.append(f"English Wikipedia infobox: {box.url} (retrieved {facts.retrieved})")
    return out


def write_draft(draft: Draft, episodes_dir: Path) -> Path:
    """Write episodes/<slug>/episode.json + sources.md (+ research.md). Never overwrites an approved episode."""
    d = episodes_dir / draft.slug
    if (d / "episode.json").exists():
        old = json.loads((d / "episode.json").read_text(encoding="utf-8"))
        if old.get("generated", {}).get("approved") or "generated" not in old:
            raise FileExistsError(f"{draft.slug} already exists and was edited or approved — not overwritten")
    (d / "narration" / "incoming").mkdir(parents=True, exist_ok=True)
    (d / "episode.json").write_text(json.dumps(draft.episode, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [f"# Sources — {draft.episode['subject']['name_en']} ({draft.episode['type']})", "",
             "Generated automatically by the research step. Status: verified = Wikidata and Wikipedia agree; "
             "single-source = only one has it; disputed = they disagree (must be resolved before rendering).", "",
             *[f"- {s}" for s in draft.sources], "", "| fact | status | detail |", "|---|---|---|",
             *[f"| {c.item} | {c.status} | {c.detail} |" for c in draft.checks]]
    if draft.questions:
        lines += ["", "## Needs your input", *[f"- {q}" for q in draft.questions]]
    (d / "sources.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    if draft.research:
        (d / "narration" / "RESEARCH.md").write_text(
            f"# Research pack — {draft.episode['subject']['name_en']}\n\n"
            "English Wikipedia introduction, retrieved automatically. Use it to plan chapters; every claim you put on "
            "screen still needs a source line in sources.md.\n\n" + draft.research + "\n", encoding="utf-8")
    return d
