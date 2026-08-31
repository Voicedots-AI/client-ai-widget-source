from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


HERE = Path(__file__).parent
SOURCE = HERE / "01-sona-ai-v2.png"
OUTPUT = HERE / "01-sona-ai-animated-v3-typography.gif"
MESSAGES = ("Tap to speak", "Ask us anything", "Speak your language")
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


source = Image.open(SOURCE).convert("RGBA")
pixels = source.load()

# Remove only the existing subtitle by rebuilding its smooth navy background
# from untouched pixels immediately above and below it.
x0, y0, x1, y1 = 735, 495, 1395, 600
top_y, bottom_y = y0 - 2, y1 + 2
for y in range(y0, y1 + 1):
    mix = (y - y0) / max(1, y1 - y0)
    for x in range(x0, x1 + 1):
        top = pixels[x, top_y]
        bottom = pixels[x, bottom_y]
        pixels[x, y] = tuple(round(top[c] * (1 - mix) + bottom[c] * mix) for c in range(4))

# Isolate the original 3D widget and place it on the same charcoal page-style
# background used in the review screenshot. The artwork itself is unchanged.
mask = Image.new("L", source.size, 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle((365, 258, 1648, 675), radius=205, fill=255)
mask_draw.ellipse((145, 205, 690, 705), fill=255)
mask_draw.polygon(((135, 430), (180, 380), (180, 525)), fill=255)

clean = Image.new("RGBA", source.size, (16, 18, 20, 255))
clean.alpha_composite(Image.composite(source, Image.new("RGBA", source.size), mask))

font = ImageFont.truetype(FONT, 52)
gold = (255, 202, 61)
frames = []

for message in MESSAGES:
    # Fade in, hold, then fade out. Only this line changes.
    opacities = (255, 255, 255, 255, 255, 255, 225, 155, 70, 155, 225)
    for opacity in opacities:
        frame = clean.copy()
        text_layer = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(text_layer)
        # A restrained shadow and semibold-style face keep the small copy crisp
        # against the navy gradient without competing with the main title.
        draw.text((770, 518), message, font=font, fill=(0, 12, 35, int(opacity * 0.65)), stroke_width=2)
        draw.text((768, 514), message, font=font, fill=(*gold, opacity), stroke_width=1, stroke_fill=(*gold, opacity))
        frame.alpha_composite(text_layer)
        frame = frame.crop((70, 135, 1705, 755))
        frame.thumbnail((1100, 420), Image.Resampling.LANCZOS)
        frames.append(frame.convert("RGB"))

frames[0].save(
    OUTPUT,
    save_all=True,
    append_images=frames[1:],
    duration=150,
    loop=0,
    disposal=2,
    optimize=True,
)
print(OUTPUT)
