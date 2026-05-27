from PIL import Image, ImageDraw, ImageFont
import os

MARGIN = 48
W, H = 64, 64
SCALE = 16
GRID_W, GRID_H = W * SCALE, H * SCALE
IMG_W, IMG_H = GRID_W + 2 * MARGIN, GRID_H + 2 * MARGIN

img = Image.new('RGBA', (IMG_W, IMG_H), (30, 30, 30, 255))
draw = ImageDraw.Draw(img)

# Try to load a font
font_path = "../public/fonts/fusion-pixel-12px-proportional-zh_hans.ttf"
font = ImageFont.truetype(font_path, 14)
small_font = ImageFont.truetype(font_path, 12)

def get_text_size(txt, f):
    try:
        bbox = draw.textbbox((0,0), txt, font=f)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception:
        try:
            return f.getsize(txt)
        except Exception:
            return 10, 10 # fallback

# draw grid
for i in range(W + 1):
    x = MARGIN + i * SCALE
    is_major = (i % 8 == 0)
    col = (120, 120, 120, 255) if is_major else (60, 60, 60, 255)
    width = 2 if is_major else 1
    draw.line((x, MARGIN, x, MARGIN + GRID_H), fill=col, width=width)
    if is_major:
        txt = str(i)
        tw, th = get_text_size(txt, small_font)
        draw.text((x - tw/2, MARGIN - 20), txt, font=small_font, fill=(200, 200, 200))

for i in range(H + 1):
    y = MARGIN + i * SCALE
    is_major = (i % 8 == 0)
    col = (120, 120, 120, 255) if is_major else (60, 60, 60, 255)
    width = 2 if is_major else 1
    draw.line((MARGIN, y, MARGIN + GRID_W, y), fill=col, width=width)
    if is_major:
        txt = str(i)
        tw, th = get_text_size(txt, small_font)
        draw.text((MARGIN - 30, y - th/2), txt, font=small_font, fill=(200, 200, 200))

parts = [
    # name, color, base_offset, decor_offset
    ("Head", (220, 80, 80, 220), (0, 0), (32, 0)),
    ("Torso", (80, 120, 220, 220), (0, 0), (0, 16)),
    ("R Arm", (80, 200, 120, 220), (0, 0), (0, 16)),
    ("L Arm", (60, 160, 160, 220), (0, 0), (16, 0)),
    ("R Leg", (220, 160, 80, 220), (0, 0), (0, 16)),
    ("L Leg", (180, 80, 180, 220), (0, 0), (-16, 0)),
]

part_data = {
    "Head": {
         "Front": ((8,8), (8,8)), "Back": ((24,8), (8,8)), "Left": ((16,8), (8,8)), 
         "Right": ((0,8), (8,8)), "Top": ((8,0), (8,8)), "Bottom": ((16,0), (8,8))
    },
    "Torso": {
         "Front": ((20,20), (8,12)), "Back": ((32,20), (8,12)), "Left": ((28,20), (4,12)), 
         "Right": ((16,20), (4,12)), "Top": ((20,16), (8,4)), "Bottom": ((28,16), (8,4))
    },
    "R Arm": {
         "Front": ((44,20), (4,12)), "Back": ((52,20), (4,12)), "Left": ((48,20), (4,12)), 
         "Right": ((40,20), (4,12)), "Top": ((44,16), (4,4)), "Bottom": ((48,16), (4,4))
    },
    "L Arm": {
         "Front": ((36,52), (4,12)), "Back": ((44,52), (4,12)), "Left": ((40,52), (4,12)), 
         "Right": ((32,52), (4,12)), "Top": ((36,48), (4,4)), "Bottom": ((40,48), (4,4))
    },
    "R Leg": {
         "Front": ((4,20), (4,12)), "Back": ((12,20), (4,12)), "Left": ((8,20), (4,12)), 
         "Right": ((0,20), (4,12)), "Top": ((4,16), (4,4)), "Bottom": ((8,16), (4,4))
    },
    "L Leg": {
         "Front": ((20,52), (4,12)), "Back": ((28,52), (4,12)), "Left": ((24,52), (4,12)), 
         "Right": ((16,52), (4,12)), "Top": ((20,48), (4,4)), "Bottom": ((24,48), (4,4))
    }
}

def draw_part(name, face, offset_x, offset_y, size_w, size_h, color, is_decor=False):
    x1, y1 = MARGIN + offset_x * SCALE, MARGIN + offset_y * SCALE
    x2, y2 = x1 + size_w * SCALE, y1 + size_h * SCALE
    
    fill_col = color if not is_decor else (color[0], color[1], color[2], 120)
    outline_col = (255,255,255,220) if not is_decor else (color[0], color[1], color[2], 255)
    draw.rectangle([x1, y1, x2, y2], fill=fill_col, outline=outline_col, width=2)
    
    # text
    txt_main = name
    txt_sub = face
    
    w_main, h_main = get_text_size(txt_main, font)
    w_sub, h_sub = get_text_size(txt_sub, small_font)
    w_decor, h_decor = get_text_size('(Overlay)', small_font)
        
    cx = x1 + (size_w * SCALE) / 2
    cy = y1 + (size_h * SCALE) / 2
    
    draw.text((cx - w_main/2, cy - 14), txt_main, font=font, fill=(255,255,255,255))
    draw.text((cx - w_sub/2, cy + 2), txt_sub, font=small_font, fill=(255,255,255,220), align="center")
    if is_decor:
        draw.text((cx - w_decor/2, cy + 14), "(Overlay)", font=small_font, fill=(255,255,255,220))

for part_name, color, base_off, decor_off in parts:
    faces = part_data[part_name]
    for face, (pos, size) in faces.items():
        # draw base layer
        draw_part(part_name, face, pos[0], pos[1], size[0], size[1], color, is_decor=False)
        
        # draw decor layer
        dx, dy = pos[0] + decor_off[0], pos[1] + decor_off[1]
        draw_part(part_name, face, dx, dy, size[0], size[1], color, is_decor=True)

# Add title or legend
draw.text((MARGIN + 10, IMG_H - 35), "Minecraft 64x64 Skin UV Map", font=font, fill=(255,255,255,255))
draw.text((IMG_W-  150, IMG_H - 35), "By Entropydrop.com", font=small_font, fill=(200,200,200,255))

out_path = '../public/articles/images/skingen_uv_map.png'
img.save(out_path)
print(f'Saved to {out_path}')
