import sys
import os
from PIL import Image, ImageDraw, ImageFont

# Path configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_PATH_WOFF2 = os.path.join(BASE_DIR, 'src', 'assets', 'fonts', 'fusion-pixel-12px-proportional-zh_hans.ttf.woff2')
FONT_PATH_TTF = os.path.join(BASE_DIR, 'src', 'assets', 'fonts', 'fusion-pixel-12px-proportional-zh_hans.ttf')
OUTPUT_PATH = os.path.join(BASE_DIR, 'public', 'favicon.png')

def decompress_woff2(input_path, output_path):
    """Attempt to decompress WOFF2 to TTF using fontTools."""
    try:
        from fontTools.ttLib import woff2
        import brotli  # fontTools needs brotli for decompressing woff2
        print(f"Decompressing {input_path}...")
        woff2.decompress(input_path, output_path)
        print(f"Created temporary TTF: {output_path}")
        return True
    except ImportError as e:
        print(f"Error: Missing dependencies for WOFF2 decompression ({e}).")
        print("Please install them using: pip install fonttools brotli")
        return False
    except Exception as e:
        print(f"Failed to decompress WOFF2: {e}")
        return False

def generate_favicon(font_path, text="E", size=24):
    """Generate a square favicon with centered text."""
    try:
        # Create a new black image
        image = Image.new('RGB', (size, size), color='black')
        draw = ImageDraw.Draw(image)

        # Load the font
        # For pixel fonts, we usually want a specific size. 
        # Fusion Pixel 12px works best at multiples of 12 (12, 24, 48, etc.)
        # but we can try to fit it into 64px.
        font_size = 16
        try:
            font = ImageFont.truetype(font_path, font_size)
        except Exception as e:
            print(f"Could not load font from {font_path}: {e}")
            return False

        # Draw the text centered using "mm" (middle-middle) anchor
        draw.text((size // 2+1, size // 2-1), text, font=font, fill='white', anchor="mm")


        # Save the image
        image.save(OUTPUT_PATH)
        print(f"Successfully generated favicon: {OUTPUT_PATH}")
        return True
    except Exception as e:
        print(f"Error generating favicon: {e}")
        return False

if __name__ == "__main__":
    temp_ttf_created = False
    active_font_path = FONT_PATH_TTF

    # 1. Check if TTF exists
    if not os.path.exists(FONT_PATH_TTF):
        print(f"TTF font not found at {FONT_PATH_TTF}")
        # 2. Try decompressing WOFF2 if it exists
        if os.path.exists(FONT_PATH_WOFF2):
            if decompress_woff2(FONT_PATH_WOFF2, FONT_PATH_TTF):
                temp_ttf_created = True
                active_font_path = FONT_PATH_TTF
            else:
                sys.exit(1)
        else:
            print(f"Font file not found: {FONT_PATH_WOFF2}")
            sys.exit(1)

    # 3. Generate favicon
    success = generate_favicon(active_font_path)

    # 4. Cleanup temporary TTF if we created it
    if temp_ttf_created and os.path.exists(FONT_PATH_TTF):
        # os.remove(FONT_PATH_TTF) # Uncomment to delete after use
        print(f"Kept {FONT_PATH_TTF} for future use (optional).")

    if not success:
        sys.exit(1)
