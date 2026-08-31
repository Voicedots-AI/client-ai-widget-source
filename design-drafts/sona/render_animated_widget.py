from math import sin, pi
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 1000, 340
OUT = Path(__file__).with_name("01-sona-ai-animated.gif")
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MESSAGES = ("Tap to speak", "Ask us anything", "Speak your language")


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def render(message: str, phase: float) -> Image.Image:
    scale = 2
    image = Image.new("RGBA", (WIDTH * scale, HEIGHT * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")

    def box(coords, radius, fill, outline=None, width=1):
        coords = tuple(int(v * scale) for v in coords)
        draw.rounded_rectangle(
            coords,
            radius=int(radius * scale),
            fill=fill,
            outline=outline,
            width=int(width * scale),
        )

    # Soft shadow and navy body.
    box((152, 88, 955, 278), 92, (0, 12, 42, 36))
    box((132, 65, 947, 263), 96, (4, 27, 70, 255), (21, 132, 255, 255), 5)
    box((141, 74, 938, 254), 86, (7, 39, 85, 255), (0, 78, 190, 180), 2)

    # Microphone medallion with a gentle animated halo.
    pulse = (sin(phase * 2 * pi) + 1) / 2
    cx, cy = 154 * scale, 164 * scale
    for offset, alpha in ((19 + 8 * pulse, 35), (10 + 5 * pulse, 65)):
        r = int((103 + offset) * scale)
        draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=(33, 166, 255, alpha), width=4 * scale)
    r = 105 * scale
    draw.ellipse((cx-r, cy-r, cx+r, cy+r), fill=(7, 31, 83, 255), outline=(39, 150, 255, 255), width=6 * scale)
    r = 88 * scale
    draw.ellipse((cx-r, cy-r, cx+r, cy+r), fill=(250, 252, 255, 255), outline=(255, 190, 35, 255), width=5 * scale)

    # Microphone.
    mic_blue = (14, 80, 218, 255)
    draw.rounded_rectangle((127*scale, 100*scale, 181*scale, 177*scale), radius=25*scale, fill=mic_blue)
    draw.arc((112*scale, 131*scale, 196*scale, 211*scale), 0, 180, fill=(7, 53, 153, 255), width=8*scale)
    draw.line((154*scale, 201*scale, 154*scale, 221*scale), fill=(7, 53, 153, 255), width=8*scale)
    draw.line((128*scale, 221*scale, 180*scale, 221*scale), fill=(7, 53, 153, 255), width=8*scale)

    # Animated waveform bars.
    for index, x in enumerate((277, 288, 299, 310)):
        amount = 13 + 17 * ((sin(phase * 2 * pi + index * 0.9) + 1) / 2)
        draw.rounded_rectangle(
            (x*scale, (164-amount)*scale, (x+6)*scale, (164+amount)*scale),
            radius=3*scale,
            fill=(22, 145, 255, 255),
        )

    # Text.
    draw.text((346*scale, 91*scale), "Sona AI", font=font(FONT_BOLD, 72*scale), fill=(255, 255, 255, 255))
    # A short fade at the start/end of each message's hold.
    local = phase % 1
    opacity = int(255 * min(1, local * 7, (1-local) * 7))
    draw.text((350*scale, 184*scale), message, font=font(FONT_REGULAR, 32*scale), fill=(255, 197, 57, opacity))

    # Arrow button.
    ax, ay, ar = 858*scale, 164*scale, 45*scale
    draw.ellipse((ax-ar, ay-ar, ax+ar, ay+ar), fill=(12, 105, 247, 255), outline=(52, 177, 255, 255), width=3*scale)
    draw.line((836*scale, 164*scale, 879*scale, 164*scale), fill="white", width=7*scale)
    draw.line((863*scale, 148*scale, 879*scale, 164*scale, 863*scale, 180*scale), fill="white", width=7*scale, joint="curve")

    return image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


frames = []
for message in MESSAGES:
    for frame_index in range(12):
        frames.append(render(message, frame_index / 12))

frames[0].save(
    OUT,
    save_all=True,
    append_images=frames[1:],
    duration=120,
    loop=0,
    disposal=2,
    optimize=True,
)
print(OUT)
