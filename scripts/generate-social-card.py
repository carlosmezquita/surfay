"""Generate Surfay's original social card (optional dependency: Pillow).

No photography or third-party illustrations are used. Re-run from the repo
root with `python scripts/generate-social-card.py`; the PNG is committed.
"""

from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCALE = 2
SIZE = (1200, 630)
image = Image.new("RGB", tuple(n * SCALE for n in SIZE), "#f4ebd8")
draw = ImageDraw.Draw(image)


def font(size, serif=False):
    name = "DejaVuSerif" if serif else "DejaVuSans"
    try:
        return ImageFont.truetype(f"{name}.ttf", size * SCALE)
    except OSError:
        return ImageFont.load_default(size=size * SCALE)


def label(position, text, size, fill="#173c3a", serif=False):
    draw.text(tuple(n * SCALE for n in position), text,
              font=font(size, serif), fill=fill)


label((72, 50), "GALICIA / ATLANTIC COAST", 19)
label((65, 113), "Surfay", 126, serif=True)
label((74, 284), "Previsión de surf, spot a spot.", 34)
label((75, 350), "MAR DE FONDO   /   VIENTO   /   MAREA", 18)

# Original procedural wave geometry, drawn in two layers.
for baseline, amplitude, color, phase in [
    (487, 26, "#8bb3a9", 0), (537, 38, "#173c3a", 1.4)
]:
    points = [(x * SCALE, round((baseline + amplitude * math.sin(
        x / 170 + phase)) * SCALE)) for x in range(SIZE[0] + 1)]
    points += [(SIZE[0] * SCALE, SIZE[1] * SCALE), (0, SIZE[1] * SCALE)]
    draw.polygon(points, fill=color)

image.resize(SIZE, Image.Resampling.LANCZOS).quantize(colors=64).save(
    ROOT / "public/og.png", optimize=True)
