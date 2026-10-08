# Local speech recognition (faster-whisper, MIT; Whisper weights MIT) — supporting evidence only.
# Used to (1) check generated/imported narration against the script and (2) find sentence boundaries
# in a single full-narration file. Usage: python studio/asr.py in.wav [more.wav ...] > out.json
import json, os, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace"); sys.stderr.reconfigure(encoding="utf-8", errors="replace")
try:
    import truststore; truststore.inject_into_ssl()  # Windows certificate store (antivirus HTTPS inspection)
except ImportError:
    pass
CACHE = os.path.join(os.path.dirname(__file__), "..", "tools", "hf-cache")
os.environ.setdefault("HF_HOME", CACHE)
import torch  # its bundled CUDA 12 cuBLAS/cuDNN DLLs are reused by CTranslate2
os.add_dll_directory(os.path.join(os.path.dirname(torch.__file__), "lib"))
from faster_whisper import WhisperModel

model = WhisperModel(os.environ.get("FVS_ASR_MODEL", "large-v3-turbo"), device="cuda", compute_type="int8_float16", download_root=CACHE)
out = {}
for f in sys.argv[1:]:
    segs, info = model.transcribe(f, language="ar", word_timestamps=True, vad_filter=False, beam_size=5)
    words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for s in segs for w in (s.words or [])]
    out[f] = {"text": " ".join(w["w"] for w in words), "words": words}
print(json.dumps(out, ensure_ascii=False))
