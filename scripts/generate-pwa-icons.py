"""Generate installation icons from the existing favicon (requires Pillow)."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "favicon.png"
OUTPUT = ROOT / "public" / "icons"


def main():
    OUTPUT.mkdir(exist_ok=True)
    with Image.open(SOURCE) as original:
        source = original.convert("RGBA")

    background = source.getpixel((0, 0))[:3]
    side = max(source.size)
    square = Image.new("RGB", (side, side), background)
    # Preserve the favicon's composition, including its offset shadow. Only pad
    # the canvas to square; do not redraw or re-center the foreground artwork.
    square.paste(source, ((side - source.width) // 2, (side - source.height) // 2), source)

    for name, size, maskable in [
        ("pwa-favicon-192.png", 192, False),
        ("pwa-favicon-512.png", 512, False),
        ("pwa-favicon-maskable-512.png", 512, True),
        ("apple-touch-icon-favicon.png", 180, False),
    ]:
        # Maskable icons get an extra 5% border on each side to keep the original
        # artwork and shadow inside Android's central 80%-diameter safe circle.
        content_size = round(size * 0.9) if maskable else size
        content = square.resize((content_size, content_size), Image.Resampling.NEAREST)
        icon = Image.new("RGB", (size, size), background)
        offset = (size - content_size) // 2
        icon.paste(content, (offset, offset))
        icon.save(OUTPUT / name, optimize=True)
        print(f"Generated {name} ({size}x{size}) from {SOURCE.name}")


if __name__ == "__main__":
    main()
