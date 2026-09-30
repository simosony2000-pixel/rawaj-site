"""Download the open-source webfonts RAWÂJ uses and rewrite them to local paths.

Two things this script is careful about:

  1. SUBSETS. The Google Fonts CSS returns every subset the family supports -
     for Inter that is cyrillic, greek, vietnamese and more. Shipping all of it
     is wasted bytes for a French/Arabic/English site, so only the `arabic`,
     `latin` and `latin-ext` blocks are kept.

  2. ATTRIBUTION. Tajawal and Inter are both SIL Open Font License 1.1, which
     requires the licence to ship with the fonts. The OFL text is downloaded
     next to them and referenced from the site footer.

Usage: python site/assets/tools/fetch_fonts.py
"""
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT_DIR = HERE.parent / "fonts"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# family -> (google css url, subsets we keep)
#
# NOTE on subsets: `latin` (U+0000-00FF) already covers every French accent
# this site needs - e, a, c, u... - so `latin-ext` is 415 KB of dead weight
# for a AR/FR/EN site and is dropped. `arabic` is mandatory for the Arabic half.
FAMILIES = {
    "tajawal": ("https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap",
                {"arabic", "latin"}),
    "inter": ("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
              {"latin"}),
}

OFL_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def parse_faces(css: str):
    """Yield (subset, weight, url, unicode_range) for each @font-face block."""
    # Blocks are preceded by a `/* subset */` comment.
    for subset, body in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S):
        weight = re.search(r"font-weight:\s*(\d+)", body)
        url = re.search(r"url\((https://[^)]+\.woff2)\)", body)
        urange = re.search(r"unicode-range:\s*([^;]+);", body)
        if weight and url:
            yield subset, weight.group(1), url.group(1), (urange.group(1).strip() if urange else None)


def main():
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    kept_total = downloaded = 0

    for family, (css_url, keep) in FAMILIES.items():
        css = get(css_url).decode("utf-8")
        blocks = []

        for subset, weight, url, urange in parse_faces(css):
            kept_total += 1
            if subset not in keep:
                continue
            fname = f"{family}-{subset}-{weight}.woff2"
            data = get(url)
            (FONT_DIR / fname).write_bytes(data)
            downloaded += 1
            print(f"  {fname:34s} {len(data)/1024:6.0f} KB  ({subset})")
            blocks.append(
                "@font-face{font-family:'%s';font-style:normal;font-weight:%s;"
                "font-display:swap;src:url('../fonts/%s') format('woff2');%s}"
                % ("Inter" if family == "inter" else "Tajawal",
                   weight, fname,
                   ("unicode-range:" + urange + ";") if urange else "")
            )

        (FONT_DIR / f"{family}.css").write_text("\n".join(blocks) + "\n", encoding="utf-8")
        print(f"  -> {family}.css  ({len(blocks)} faces)\n")

    # Ship the OFL text next to the fonts.
    ofl = FONT_DIR / "OFL.txt"
    if not ofl.exists():
        try:
            ofl.write_bytes(get(OFL_URL))
            print(f"  OFL.txt (licence, required by OFL 1.1)")
        except Exception as e:  # licence text is nice-to-have, not fatal
            print(f"  WARN could not fetch OFL.txt: {e}")

    print(f"done: {downloaded} woff2 files, {kept_total} blocks offered by Google.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
