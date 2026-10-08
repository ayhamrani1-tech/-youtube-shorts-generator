"""Re-record the research fixtures used by tests/test_research.py (needs internet; free APIs only).

    .venv\\Scripts\\python.exe -m tests.record_fixtures "Luka Modric" "Mohamed Salah"

Responses are trimmed to the fields the code reads, so the file stays small.
"""
import json
import sys
from pathlib import Path

from bot.research import http, wikidata, wikipedia

KEEP_CLAIMS = {"P31", "P106", "P54", "P27", "P1532", "P413", "P569"}
OUT = Path(__file__).parent / "fixtures" / "research.json"


def main(names):
    rec = {}

    def recording(url, params, **kw):
        data = http.fetch_json(url, params, use_cache=False)
        rec[url + "?" + json.dumps(params, sort_keys=True, ensure_ascii=False)] = data
        return data

    for name in names:
        hit = wikidata.search_footballers(name, fetch=recording)[0]
        player = wikidata.get_player(hit.qid, fetch=recording)
        wikipedia.get_infobox(player.enwiki, fetch=recording)
        print(f"{name}: {hit.qid}, {len(player.spells)} club spells")
    for v in rec.values():
        for e in v.get("entities", {}).values():
            if "claims" in e:
                e["claims"] = {p: c for p, c in e["claims"].items() if p in KEEP_CLAIMS}
            if "sitelinks" in e:
                e["sitelinks"] = {s: x for s, x in e["sitelinks"].items() if s == "enwiki"}
            for key in ("labels", "descriptions"):
                if key in e:
                    e[key] = {lang: x for lang, x in e[key].items() if lang in ("ar", "en")}
        if "parse" in v:  # keep only the infobox at the top of the article
            w = v["parse"]["wikitext"]["*"]
            v["parse"]["wikitext"]["*"] = w[: w.find("\n}}") + 4] if "\n}}" in w else w[:20000]
    OUT.write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rec)} responses → {OUT}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["Luka Modric", "Mohamed Salah"])
