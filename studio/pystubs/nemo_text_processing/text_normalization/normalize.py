# Stub: NeMo text normalization (pynini) cannot be built on Windows. SILMA is always called with
# normalize_numbers=False, so this is never used; numbers are written as Arabic words in the scripts.
class Normalizer:
    def __init__(self, *a, **k):
        raise RuntimeError("NeMo normalizer unavailable on Windows — write numbers as words")
