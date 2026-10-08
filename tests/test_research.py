"""Offline research tests: real Wikidata/Wikipedia responses recorded once into tests/fixtures/research.json."""
import json
from pathlib import Path

import pytest

from bot.research import builder, wikidata, wikipedia
from bot.research.arabic import number_words

FIX = json.loads((Path(__file__).parent / "fixtures" / "research.json").read_text(encoding="utf-8"))


def fake_fetch(url, params, **kw):
    key = url + "?" + json.dumps(params, sort_keys=True, ensure_ascii=False)
    if key not in FIX:
        raise AssertionError(f"no fixture for {key[:120]}")
    return FIX[key]


@pytest.fixture(scope="module")
def modric():
    p = wikidata.get_player("Q483837", fetch=fake_fetch)
    return p, wikipedia.get_infobox(p.enwiki, fetch=fake_fetch)


def test_search_finds_only_footballers():
    hits = wikidata.search_footballers("Luka Modric", fetch=fake_fetch)
    assert [h.qid for h in hits] == ["Q483837"]


def test_national_and_youth_teams_are_excluded(modric):
    p, _ = modric
    assert {s.name_en for s in p.spells} >= {"GNK Dinamo Zagreb", "Tottenham Hotspur F.C.", "AC Milan"}
    assert not any("national" in s.name_en.lower() for s in p.spells)
    assert any("national" in x.lower() for x in p.excluded)


def test_loans_inside_a_spell_are_split_with_a_return(modric):
    p, _ = modric
    kinds = [(s["club"], s["kind"]) for s in builder.stops_from_spells(p.spells)]
    assert kinds[:4] == [("دينامو زغرب", "club"), ("زرينيسكي موستار", "loan"), ("إنتر زابرشيتش", "loan"), ("دينامو زغرب", "return")]
    assert len(kinds) == 7


def test_transfer_quiz_is_cross_checked_and_has_word_numbers(modric):
    draft = builder.transfer_quiz(*modric)
    assert all(c.status == "verified" for c in draft.checks)
    stops = draft.episode["data"]["stops"]
    assert stops[-1]["years"] == "2025 – الآن"           # open-ended range keeps the Arabic word (RTL)
    assert "ألفين وثلاثة" in stops[0]["narration"]       # TTS reads words, not digits
    assert draft.episode["data"]["canvaPages"] is None   # rendered locally, no Canva page needed
    assert draft.episode["generated"]["approved"] is False


def test_attribute_quiz_marks_single_source_number(modric):
    draft = builder.attribute_quiz(*modric)
    values = {a["label"]: a["value"] for a in draft.episode["data"]["attributes"]}
    assert values["النادي"] == "إيه سي ميلان" and values["رقم القميص"] == "14"
    statuses = {c.item.split()[0]: c.status for c in draft.checks}
    assert statuses["shirt"] == "single-source"          # only Wikipedia has the number
    assert draft.episode["data"]["asOf"].startswith("المعلومات حسب")


def test_disagreement_is_flagged_as_disputed(modric):
    p, box = modric
    box.clubs[3].start = 2006                             # pretend Wikipedia says Tottenham from 2006
    checks = builder.cross_check(p, box)
    assert any(c.status == "disputed" and "Tottenham" in c.item for c in checks)


def test_write_draft_never_overwrites_an_approved_episode(tmp_path, modric):
    draft = builder.transfer_quiz(*modric)
    d = builder.write_draft(draft, tmp_path)
    assert (d / "episode.json").exists() and "verified" in (d / "sources.md").read_text(encoding="utf-8")
    ep = json.loads((d / "episode.json").read_text(encoding="utf-8"))
    ep["generated"]["approved"] = True
    (d / "episode.json").write_text(json.dumps(ep), encoding="utf-8")
    with pytest.raises(FileExistsError):
        builder.write_draft(draft, tmp_path)


@pytest.mark.parametrize("n,words", [(2003, "ألفين وثلاثة"), (1985, "ألف وتسعمئة وخمسة وثمانين"), (14, "أربعة عشر"), (2025, "ألفين وخمسة وعشرين")])
def test_number_words(n, words):
    assert number_words(n) == words


def test_loan_back_to_a_former_club_matches_the_right_spell():
    """Bale: Tottenham 2007–2013, then a Tottenham loan 2020–21 — must not be compared with the first spell."""
    from bot.research.wikidata import ClubSpell, PlayerFacts
    from bot.research.wikipedia import Infobox, InfoboxClub
    spells = [ClubSpell("Q18741", "توتنهام هوتسبير", "Tottenham Hotspur F.C.", 2007, 2013, enwiki="Tottenham Hotspur F.C."),
              ClubSpell("Q18741", "توتنهام هوتسبير", "Tottenham Hotspur F.C.", 2020, 2021, loan=True, enwiki="Tottenham Hotspur F.C.")]
    facts = PlayerFacts("Q1", "", "X", None, "", "", [], [], spells, None)
    box = Infobox("X", [InfoboxClub("Tottenham Hotspur F.C.", "Tottenham Hotspur", 2007, 2013, False),
                        InfoboxClub("Tottenham Hotspur F.C.", "Tottenham Hotspur (loan)", 2020, 2021, True)])
    assert [c.status for c in builder.cross_check(facts, box)] == ["verified", "verified"]


def test_club_filter_accepts_mens_team_class_and_rejects_national_teams():
    """Chelsea F.C. is typed only as Q103229495 ("men's association football team") on Wikidata; it must count as a club.
    Bug found 2026-10-08 with Kevin De Bruyne (his Chelsea spell disappeared)."""
    def ent(types, name):
        return {"labels": {"en": {"value": name}},
                "claims": {"P31": [{"mainsnak": {"datavalue": {"value": {"id": t}}}} for t in types]}}
    assert wikidata.is_club(ent(["Q103229495"], "Chelsea F.C."))
    assert wikidata.is_club(ent(["Q476028"], "Real Madrid CF"))
    assert not wikidata.is_club(ent(["Q135408445"], "Croatia men's national football team"))
    assert not wikidata.is_club(ent(["Q103229495"], "Belgium men's national football team"))
