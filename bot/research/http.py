"""Small JSON-over-HTTP helper for free public APIs (Wikidata, Wikipedia). Standard library only.

* Sends a descriptive User-Agent, as Wikimedia's API policy asks.
* Caches every response in `research_cache/` for a day, so re-running a job does not re-download.
* Tests replace `fetch_json` with fixtures (no network in tests).
"""
from __future__ import annotations

import hashlib
import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

USER_AGENT = "FootballVideoStudio/0.2 (personal video research; contact via GitHub ayhamrani1-tech)"
CACHE_DIR = Path(__file__).resolve().parents[2] / "research_cache"
CACHE_SECONDS = 24 * 3600

# Certificates are still fully verified. Python 3.13+ also enables VERIFY_X509_STRICT, which rejects the
# HTTPS-inspection certificate of some antivirus products (e.g. Avast: "Basic Constraints … not marked
# critical"). Only that strict RFC-5280 rule is relaxed.
_SSL = ssl.create_default_context()
_SSL.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)


class ResearchError(RuntimeError):
    """A source could not be reached or returned something unusable."""


def fetch_json(url: str, params: dict, *, retries: int = 3, use_cache: bool = True) -> dict:
    full = url + "?" + urllib.parse.urlencode({**params, "format": "json"})
    key = hashlib.sha1(full.encode()).hexdigest()[:20]
    cached = CACHE_DIR / f"{key}.json"
    if use_cache and cached.exists() and time.time() - cached.stat().st_mtime < CACHE_SECONDS:
        return json.loads(cached.read_text(encoding="utf-8"))
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=20, context=_SSL) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            CACHE_DIR.mkdir(exist_ok=True)
            cached.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise ResearchError(f"could not reach {urllib.parse.urlparse(url).netloc}: {last}")
