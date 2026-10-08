# SILMA TTS (weights Apache-2.0, code MIT; CATT diacritizer Apache-2.0; Vocos vocoder MIT) — local GPU narration.
# Called by `node studio/narration.mjs tts|audition`. Pipeline per line:
#   plain text → CATT automatic diacritization → pronunciation lexicon (names, sukun endings) → SILMA.
# Usage: python studio/tts_silma.py jobs.json   jobs.json = {"ref": wav, "refText": str, "seed": int, "speed": float,
#        "lexicon": {plain: diacritized}, "jobs": [{"text": str, "out": wav}]}
import json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace"); sys.stderr.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "pystubs"))  # NeMo normalizer stub (pynini has no Windows build)
try:
    import truststore; truststore.inject_into_ssl()  # use the Windows certificate store (antivirus HTTPS inspection)
except ImportError:
    pass
CACHE = os.path.join(os.path.dirname(__file__), "..", "tools", "hf-cache")
os.environ.setdefault("HF_HOME", CACHE)
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
from silma_tts.api import SilmaTTS
from silma_tts.infer import utils_infer as U

HARAKAT = "ً-ْٰ"
def apply_lexicon(text, lex):
    # match the plain spelling with any diacritics between letters, after an optional proclitic
    for plain, said in sorted(lex.items(), key=lambda kv: -len(kv[0])):
        if plain.startswith("_"): continue
        body = f"[{HARAKAT}]*".join(map(re.escape, plain))
        pat = re.compile(f"(?<![ء-ي])((?:[وفبلك][{HARAKAT}]*)?){body}[{HARAKAT}]*(?![ء-ي])")
        text = pat.sub(lambda m: m.group(1) + said, text)
    return text

cfg = json.load(open(sys.argv[1], encoding="utf-8"))
tts = SilmaTTS(enable_normalizer=False, force_tashkeel=True, hf_cache_dir=CACHE)  # loads CATT into U.tashkeel_model
lex = cfg.get("lexicon", {})
for j in cfg["jobs"]:
    src = j["text"].strip()
    plain = re.sub(f"[{HARAKAT}]", "", src)
    auto = re.sub(U.arabic_sentence_with_punct, lambda m: U.tashkeel_model.do_tashkeel(m.group(0)), plain)
    # words the script diacritized by hand override the automatic diacritization (same word position)
    s_tok, a_tok = src.split(), auto.split()
    if len(s_tok) == len(a_tok):
        a_tok = [s if len(re.findall(f"[{HARAKAT}]", s)) >= 2 else a for s, a in zip(s_tok, a_tok)]
    text = apply_lexicon(" ".join(a_tok), lex)
    print("SAY", text, flush=True)
    tts.infer(ref_file=cfg["ref"], ref_text=cfg["refText"], gen_text=text, file_wave=j["out"],
              seed=cfg.get("seed", 1234), speed=cfg.get("speed", 1.0), normalize_numbers=False, remove_silence=False,
              force_tashkeel=False)
    print("OK", j["out"], flush=True)
