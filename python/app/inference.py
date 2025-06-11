import tempfile
from PIL import Image, ImageDraw

def generate_image(prompt: str) -> str:
    # Fake: Generate a 256x256 PNG with text (replace with real model)
    img = Image.new("RGB", (256, 256), color=(73, 109, 137))
    d = ImageDraw.Draw(img)
    d.text((10,120), prompt[:20], fill=(255,255,0))
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    img.save(tmp.name, format="PNG")
    tmp.close()
    return tmp.name
