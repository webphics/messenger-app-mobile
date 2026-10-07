"""Place the real captures into the generated iPhone and iPad frames at native resolution.

The first pass let GPT composite these and upscale 851x1848 to 1320x2868, which is why the
iOS set was softer than the Android one. This does what android/compose-captures.py does:
paste the capture into the frame's screen rectangle from generated/manifest.json.

The captures are Android captures (no Mac yet, see images.md), so two things are done to
them first: the Android status bar is cropped off, and the top is padded with the screen's
own background so the Dynamic Island sits over empty space rather than over the app header,
the way the real iOS safe area would.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent
FRAMES = ROOT / 'generated'
CAPTURES = ROOT / 'captures'
OUT = ROOT / 'screenshots'
OUT.mkdir(exist_ok=True)

# frame -> (capture, output name). Extras reuse the frame of their numbered caption.
JOBS = {
    'iphone-01.png': ('01-support-thread-android.png', 'iphone-01.png'),
    'iphone-02.png': ('02-attachments-android.png', 'iphone-02.png'),
    'iphone-03.png': ('03-unassigned-android.png', 'iphone-03.png'),
    'iphone-03.png#engage': ('03b-engage-android.png', 'iphone-03-engage.png'),
    'iphone-04.png': ('04-admin-overview-android.png', 'iphone-04.png'),
    'iphone-05.png': ('05-offline-list-android.png', 'iphone-05.png'),
    'iphone-06.png': ('06-wall-android.png', 'iphone-06.png'),
    'iphone-06.png#communities': ('06b-communities-android.png', 'iphone-06-communities.png'),
    'iphone-07.png': ('07-sign-in-android.png', 'iphone-07.png'),
    'ipad-1.png': ('ipad-1-support-android.png', 'ipad-1.png'),
    'ipad-3.png': ('ipad-3-unassigned-android.png', 'ipad-3.png'),
    'ipad-4.png': ('ipad-4-admin-android.png', 'ipad-4.png'),
}

# Android status bar height by capture size. Measured, not detected: on the sign-in and
# admin screens the bar's background equals the screen's, so detection has nothing to find.
STATUS_BAR = {(1080, 2400): 128, (1600, 2133): 114, (1600, 2013): 114}

# Top padding as a fraction of screen width: room for the Dynamic Island on the phone and a
# status-bar-sized breath on the iPad.
TOP_PAD = {'iphone': 0.13, 'ipad': 0.04}


def fit_width(capture, width, height):
    """Scale to the screen's width and never crop the sides.

    The generated frames are drawn narrower than a real iPad, so filling the
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


def prepared(capture: Image.Image, kind: str) -> Image.Image:
    bar = STATUS_BAR.get(capture.size)
    if bar is None:
        raise SystemExit(f'unknown capture size {capture.size}; add it to STATUS_BAR')
    body = capture.crop((0, bar, capture.width, capture.height))
    bg = body.getpixel((int(body.width * 0.6), 2))
    pad = round(body.width * TOP_PAD[kind])
    out = Image.new('RGB', (body.width, body.height + pad), bg)
    out.paste(body, (0, pad))
    return out


manifest = {a['file']: a for a in json.loads((FRAMES / 'manifest.json').read_text(encoding='utf-8-sig'))}
done = 0
for key, (capture_name, out_name) in JOBS.items():
    frame_name = key.split('#')[0]
    asset = manifest[frame_name]
    kind = 'iphone' if frame_name.startswith('iphone') else 'ipad'
    frame = Image.open(FRAMES / frame_name).convert('RGB')
    original = frame.copy()
    capture = prepared(Image.open(CAPTURES / capture_name).convert('RGB'), kind)

    s = asset['screen']
    x, y, w, h = s['x'], s['y'], s['width'], s['visibleHeight']
    fitted = fit_width(capture, w, h)
    radius = s['cornerRadius']
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h + radius), radius=radius, fill=255)
    frame.paste(fitted, (x, y), mask)

    if kind == 'iphone':
        # Put the Dynamic Island back: everything dark in the top-centre band of the frame.
        box = (x + w // 2 - round(w * 0.18), y, x + w // 2 + round(w * 0.18), y + round(w * 0.14))
        island = original.crop(box)
        island_mask = Image.new('L', island.size)
        island_mask.putdata([255 if sum(p[:3]) < 450 else 0 for p in island.getdata()])
        frame.paste(island, box[:2], island_mask)

    frame.save(OUT / out_name)
    assert Image.open(OUT / out_name).size == (asset['width'], asset['height'])
    done += 1
    print(f'{out_name}: {capture_name} -> {asset["width"]}x{asset["height"]}')

print(f'Composited and verified {done} App Store screenshots in ios/screenshots/.')
