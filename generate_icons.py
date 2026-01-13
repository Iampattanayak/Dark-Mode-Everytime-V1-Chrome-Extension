import os
from PIL import Image, ImageDraw

def create_icon(size):
    # Colors
    bg_color = (26, 27, 30) # Dark gray/black
    icon_color = (255, 255, 255) # White

    # Create image
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw Background Circle
    draw.ellipse([0, 0, size, size], fill=bg_color)

    # Draw Eye Shape (Ellipse)
    # Eye width ~ 70% of size, height ~ 40% of size
    eye_w = size * 0.7
    eye_h = size * 0.45
    eye_x0 = (size - eye_w) / 2
    eye_y0 = (size - eye_h) / 2
    draw.ellipse([eye_x0, eye_y0, eye_x0 + eye_w, eye_y0 + eye_h], fill=icon_color)

    # Draw Pupil (Circle in middle) uses bg_color
    pupil_size = size * 0.25
    pupil_x0 = (size - pupil_size) / 2
    pupil_y0 = (size - pupil_size) / 2
    draw.ellipse([pupil_x0, pupil_y0, pupil_x0 + pupil_size, pupil_y0 + pupil_size], fill=bg_color)

    return img

def main():
    icons_dir = "assets"
    if not os.path.exists(icons_dir):
        os.makedirs(icons_dir)

    sizes = [16, 48, 128]
    
    for size in sizes:
        img = create_icon(size)
        filename = f"{icons_dir}/icon{size}.png"
        img.save(filename)
        print(f"Generated {filename}")

if __name__ == "__main__":
    main()
