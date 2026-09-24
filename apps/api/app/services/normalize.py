"""
Entity-resolution normalization (mirrors the v1 Node logic so both stacks agree).
Strips parentheticals + trailing legal/geo qualifier tokens; keeps descriptive words
(Technologies, Systems, Labs). "EY" and "EY India (Ernst & Young Services Pvt Ltd)" -> "ey".
"""
import re
import unicodedata

_JUNK = {
    "pvt", "private", "ltd", "limited", "inc", "incorporated", "llc", "llp", "corp",
    "corporation", "gmbh", "plc", "co", "group", "holdings", "services", "solutions",
    "india", "indian", "usa", "us", "uk", "emea", "apac", "global", "worldwide",
    "international", "intl",
}


def normalize_company_name(name: str | None) -> str:
    n = unicodedata.normalize("NFKD", (name or "").lower())
    n = re.sub(r"\(.*?\)", " ", n)          # drop parentheticals
    n = re.sub(r"[^\w\s.]", " ", n, flags=re.UNICODE)
    n = re.sub(r"\s+", " ", n).strip()
    prev = None
    while n != prev:
        prev = n
        n = re.sub(r"[.,]", " ", n)
        n = re.sub(r"\s+", " ", n).strip()
        words = n.split(" ")
        if len(words) > 1 and words[-1] in _JUNK:
            words.pop()
            n = " ".join(words).strip()
    return n
