#!/usr/bin/env python3
"""Build labeled contact sheets of fetched hero thumbs for fast visual review.

Reads data/city-media.json + assets/cities/*-sm.webp, writes
/tmp/atlas-contact-sheet-N.png (4x5 grid, city name captioned under each cell).
Review the sheets, then flip review:true in city-media.json for the keepers.
"""
import json, os, math
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(ROOT, "data", "city-media.json")

CELL_W, CELL_H, CAP_H = 320, 200, 26
COLS, ROWS = 4, 5


def main():
    media = json.load(open(MEDIA))
    entries = [(k, v) for k, v in sorted(media.items()) if k != "_meta" and v.get("thumb")]
    per_sheet = COLS * ROWS
    sheets = math.ceil(len(entries) / per_sheet)
    for s in range(sheets):
        chunk = entries[s * per_sheet:(s + 1) * per_sheet]
        rows = math.ceil(len(chunk) / COLS)
        sheet = Image.new("RGB", (COLS * CELL_W, rows * (CELL_H + CAP_H)), "#1a1a1a")
        draw = ImageDraw.Draw(sheet)
        for i, (name, v) in enumerate(chunk):
            x, y = (i % COLS) * CELL_W, (i // COLS) * (CELL_H + CAP_H)
            path = os.path.join(ROOT, v["thumb"])
            try:
                img = Image.open(path).convert("RGB")
                # center-crop to cell aspect
                tw, th = img.size
                target = CELL_W / CELL_H
                if tw / th > target:
                    nw = int(th * target)
                    img = img.crop(((tw - nw) // 2, 0, (tw + nw) // 2, th))
                else:
                    nh = int(tw / target)
                    img = img.crop((0, (th - nh) // 2, tw, (th + nh) // 2))
                sheet.paste(img.resize((CELL_W, CELL_H)), (x, y))
            except Exception as e:
                draw.text((x + 8, y + 8), f"MISSING: {e}", fill="#ff6666")
            flag = "" if v.get("review") else " *"
            draw.text((x + 6, y + CELL_H + 6), (name + flag)[:44], fill="#f0e9da")
        out = f"/tmp/atlas-contact-sheet-{s + 1}.png"
        sheet.save(out)
        print(f"{out}: {len(chunk)} cities")
    print(f"\n{len(entries)} entries total (* = not yet review:true)")


if __name__ == "__main__":
    main()
