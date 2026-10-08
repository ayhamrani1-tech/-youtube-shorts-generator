"""Arabic number words for narration (TTS reads words more reliably than digits)."""

UNITS = ["", "واحد", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"]
TENS = ["", "عشرة", "عشرين", "ثلاثين", "أربعين", "خمسين", "ستين", "سبعين", "ثمانين", "تسعين"]
TEENS = ["عشرة", "أحد عشر", "اثني عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"]
HUNDREDS = ["", "مئة", "مئتين", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"]
ORDINAL_F = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"]
COUNT_F = {2: "محطتان", 3: "ثلاث محطات", 4: "أربع محطات", 5: "خمس محطات", 6: "ست محطات", 7: "سبع محطات", 8: "ثماني محطات", 9: "تسع محطات"}
AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"


def number_words(n: int) -> str:
    """1985 → 'ألف وتسعمئة وخمسة وثمانين' (the form used after 'عام')."""
    if n == 0:
        return "صفر"
    parts = []
    th, h, r = n // 1000, (n % 1000) // 100, n % 100
    if th:
        parts.append("ألف" if th == 1 else "ألفين" if th == 2 else f"{number_words(th)} آلاف")
    if h:
        parts.append(HUNDREDS[h])
    if r:
        if r < 10:
            parts.append(UNITS[r])
        elif r < 20:
            parts.append(TEENS[r - 10])
        else:
            parts.append(f"{UNITS[r % 10]} و{TENS[r // 10]}" if r % 10 else TENS[r // 10])
    return " و".join(parts)


def arabic_digits(text: str | int) -> str:
    return "".join(AR_DIGITS[int(c)] if c.isdigit() else c for c in str(text))
