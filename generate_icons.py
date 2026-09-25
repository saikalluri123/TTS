import os
from PIL import Image, ImageDraw, ImageFont

def create_icon(size, filename):
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer rounded rectangle or circle with gradient-like look
    # Background rounded rect
    margin = max(1, int(size * 0.05))
    corner_radius = max(2, int(size * 0.22))
    
    # Base gradient simulated with dark purple-blue
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=corner_radius,
        fill=(15, 23, 42, 255), # dark slate 900
        outline=(59, 130, 246, 255), # blue border
        width=max(1, int(size * 0.04))
    )
    
    # Sound wave / AI spark in center
    cx = size // 2
    cy = size // 2
    
    # Draw stylized sound bars or TTS symbol
    bar_width = max(1, int(size * 0.08))
    gap = max(1, int(size * 0.05))
    heights = [0.25, 0.5, 0.75, 0.45, 0.25]
    colors = [
        (56, 189, 248, 255),  # light blue
        (99, 102, 241, 255),  # indigo
        (168, 85, 247, 255),  # purple
        (236, 72, 153, 255),  # pink
        (56, 189, 248, 255)   # light blue
    ]
    
    total_bars = len(heights)
    total_w = total_bars * bar_width + (total_bars - 1) * gap
    start_x = cx - total_w // 2
    
    for i, h in enumerate(heights):
        bx = start_x + i * (bar_width + gap)
        bh = int(size * h * 0.7)
        top_y = cy - bh // 2
        bottom_y = cy + bh // 2
        draw.rounded_rectangle(
            [bx, top_y, bx + bar_width, bottom_y],
            radius=max(1, bar_width // 2),
            fill=colors[i]
        )
        
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    img.save(filename, 'PNG')
    print(f"Generated {filename}")

if __name__ == '__main__':
    base_dir = r"c:\Users\Vineela\Downloads\TTS\icons"
    os.makedirs(base_dir, exist_ok=True)
    create_icon(16, os.path.join(base_dir, "icon16.png"))
    create_icon(48, os.path.join(base_dir, "icon48.png"))
    create_icon(128, os.path.join(base_dir, "icon128.png"))
