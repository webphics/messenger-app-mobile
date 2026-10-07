"""Place real emulator captures into the generated store frames."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent
FRAMES = ROOT / 'generated'
CAPTURES = ROOT / 'captures'
OUT = ROOT / 'screenshots'
OUT.mkdir(exist_ok=True)
PHONE_SOURCES = {
    1: '01-support-thread.png', 2: '02-attachments.png', 3: '03-unassigned.png',
    4: '04-admin-overview.png', 5: '05-notification-local-demo.png',
    6: '06-offline-inbox.png', 7: '07-wall.png', 8: '08-sign-in.png',
}


def fit_width(capture, width, height):
    """Scale to the screen's width and never crop the sides.

    The generated frames are drawn narrower than a real tablet, so filling the
    height (ImageOps.fit) cut text off both edges. A capture that comes up short
    is extended with its own bottom row, which is the gesture-bar background and
    sits under the tab capsule where the frame is cropped anyway.
    """
    scaled_h = round(capture.height * width / capture.width)
    scaled = capture.resize((width, scaled_h), Image.Resampling.LANCZOS)
    if scaled_h >= height:
        return scaled.crop((0, 0, width, height))
    out = Image.new('RGB', (width, height))
    out.paste(scaled, (0, 0))
    last_row = scaled.crop((0, scaled_h - 1, width, scaled_h))
    for yy in range(scaled_h, height):
        out.paste(last_row, (0, yy))
    return out

for asset in json.loads((FRAMES / 'manifest.json').read_text(encoding='utf-8-sig')):
    if 'screen' not in asset:
        continue
    name = asset['file']
    source = PHONE_SOURCES[int(Path(name).stem.split('-')[1])] if name.startswith('phone-') else name
    frame = Image.open(FRAMES / name).convert('RGB')
    original = frame.copy()
    capture = Image.open(CAPTURES / source).convert('RGB')
    screen = asset['screen']
    x, y, width, height = screen['x'], screen['y'], screen['width'], screen['visibleHeight']
    fitted = fit_width(capture, width, height)
    mask = Image.new('L', (width, height), 0)
    radius = round(width * 0.035) if name.startswith('tablet-') else screen['cornerRadius']
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width-1, height+radius), radius=radius, fill=255)
    frame.paste(fitted, (x, y), mask)
    camera_box = (x + width//2 - width//25, y, x + width//2 + width//25, y + width//9)
    camera = original.crop(camera_box)
    camera_mask = Image.new('L', camera.size)
    camera_mask.putdata([255 if max(pixel) < 150 else 0 for pixel in camera.getdata()])
    frame.paste(camera, camera_box[:2], camera_mask)
    filename = name.replace('.png', '-local-demo.png') if name == 'phone-05.png' else name
    frame.save(OUT / filename)
    assert Image.open(OUT / filename).size == (asset['width'], asset['height'])
print('Composited and verified 14 store screenshots.')
