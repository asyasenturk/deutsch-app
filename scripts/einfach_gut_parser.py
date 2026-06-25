#!/usr/bin/env python3
"""
Parse Einfach gut! (telc) PDF wordlists into deutsch-app JSON.

Layout: 4 columns per row — Artikel | Deutsch | Plural | Türkisch | Beispielsatz.
Each entry is one row; columns are split by x0 coordinate. Lektion headers
appear in the Deutsch column and become the `group` label for following rows.

Output schema (per plan, compatible with existing data/*.json):
  {"group": "Lektion 1: Gute Reise!",
   "de": "der Abfall",          # artikel + word, joined
   "plural": "Abfälle",          # null if absent
   "tr": "atık",
   "ex": ""}                     # Einfach gut has no example sentences
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

sys.stdout.reconfigure(encoding="utf-8")

ARTIKEL_SET = {"der", "die", "das", "der/die", "die/der"}

# Column x0 boundaries (calibrated from B1.1; identical layout across all 6 PDFs).
X_ARTIKEL_MAX = 90      # artikel column ends here
X_DE_MAX = 230          # Deutsch word column ends here
X_PL_MAX = 410          # Plural column ends here
X_TR_MAX = 650          # Türkisch column ends here

# Vertical zones: skip page header (top<90) and footer (top>790).
TOP_HEADER_MAX = 90
TOP_FOOTER_MIN = 790

LEKTION_RE = re.compile(r"^Lektion\s+\d+\s*:")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

PDFS = [
    ("Einfach_gut_A1.1_Wortschatzliste_Tuerkisch.pdf", "eg_a1_1.json"),
    ("Einfach_gut_A1.2_Wortschatzliste_Tuerkisch.pdf", "eg_a1_2.json"),
    ("Einfach_gut_A2.1_Wortschatzliste_Tuerkisch.pdf", "eg_a2_1.json"),
    ("Einfach_gut_A2.2_Wortschatzliste_Tuerkisch.pdf", "eg_a2_2.json"),
    ("Einfach_gut_B1.1_Wortschatzliste_Tuerkisch.pdf", "eg_b1_1.json"),
    ("Einfach_gut_B1.2_Wortschatzliste_Tuerkisch.pdf", "eg_b1_2.json"),
]


def words_in_zone(words, x_min, x_max):
    """Return text of words whose x0 is in [x_min, x_max), sorted left→right."""
    selected = [w for w in words if x_min <= w["x0"] < x_max]
    selected.sort(key=lambda w: w["x0"])
    return [w["text"] for w in selected]


def parse_pdf(pdf_path: Path):
    entries = []
    lektion_names = []
    current_group = None
    warnings = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            words = page.extract_words()
            # Drop header / footer zones.
            words = [w for w in words if TOP_HEADER_MAX <= w["top"] <= TOP_FOOTER_MIN]
            # Group by row (round top to nearest pt — same-line words share top within <1pt).
            rows = {}
            for w in words:
                rows.setdefault(round(w["top"]), []).append(w)

            for top in sorted(rows):
                row = rows[top]

                artikel_words = words_in_zone(row, 40, X_ARTIKEL_MAX)
                de_words = words_in_zone(row, X_ARTIKEL_MAX, X_DE_MAX)
                pl_words = words_in_zone(row, X_DE_MAX, X_PL_MAX)
                tr_words = words_in_zone(row, X_PL_MAX, X_TR_MAX)

                # Lektion header: "Lektion N: Title" lands in artikel+DE zone.
                left_text = " ".join(artikel_words + de_words)
                if LEKTION_RE.match(left_text):
                    current_group = left_text
                    lektion_names.append(left_text)
                    continue

                # Skip empty rows (no Deutsch + no Türkisch).
                if not de_words and not tr_words:
                    continue

                # Skip footer line ("© telc gGmbH – www.telc.net") — sits mid-page
                # in this layout, so the top-based filter doesn't catch it.
                if left_text.startswith("©") or "telc.net" in left_text:
                    continue

                # Artikel column: only accept canonical articles; otherwise treat as
                # part of the Deutsch word (e.g. continuation lines, rare layouts).
                artikel = None
                de_word_parts = list(de_words)
                if artikel_words:
                    if artikel_words[0] in ARTIKEL_SET:
                        artikel = artikel_words[0]
                        # Any additional tokens in the artikel zone (unlikely) → prepend to de.
                        de_word_parts = artikel_words[1:] + de_word_parts
                    else:
                        # Non-artikel token in artikel zone — fold into Deutsch.
                        de_word_parts = artikel_words + de_word_parts

                de_word = " ".join(de_word_parts).strip()
                de_full = f"{artikel} {de_word}".strip() if artikel else de_word
                plural = " ".join(pl_words).strip() or None
                tr = " ".join(tr_words).strip()

                entry = {
                    "group": current_group,
                    "de": de_full,
                    "plural": plural,
                    "tr": tr,
                    "ex": "",
                }

                if not de_full or not tr:
                    warnings.append(
                        f"  page {page_idx} top={top}: incomplete entry {entry}"
                    )

                entries.append(entry)

    return entries, lektion_names, warnings


def main():
    for pdf_name, json_name in PDFS:
        pdf_path = DATA_DIR / pdf_name
        if not pdf_path.exists():
            print(f"SKIP {pdf_name}: not found")
            continue

        print(f"\n=== {pdf_name} ===")
        entries, lektions, warnings = parse_pdf(pdf_path)
        out_path = DATA_DIR / json_name
        out_path.write_text(
            json.dumps(entries, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"  -> {json_name}: {len(entries)} entries")
        print(f"  Lektions ({len(lektions)}):")
        for l in lektions:
            print(f"    - {l}")
        if warnings:
            print(f"  WARN ({len(warnings)} incomplete):")
            for w in warnings[:10]:
                print(w)
            if len(warnings) > 10:
                print(f"    ... +{len(warnings) - 10} more")


if __name__ == "__main__":
    main()
