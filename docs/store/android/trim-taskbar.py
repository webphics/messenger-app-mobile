"""Cut the Android launcher taskbar off the tablet captures.

The tablet emulator draws a persistent taskbar (Phone, Chrome, Gmail, YouTube...) under the
app. Third-party logos in store art fail Play review, and the frames crop the bottom edge so
whether the bar shows depends on each frame's screen height. Trimming the captures removes the
question. Originals are kept under captures/raw/ so this is safe to re-run.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TASKBAR_PX = 120  # measured on every tablet capture, 7", 10" and the iPad-sized ones alike
TARGETS = sorted((ROOT / 'android' / 'captures').glob('tablet-*.png')) + \
          sorted((ROOT / 'ios' / 'captures').glob('ipad-*.png'))


def has_red(im, y0, y1):
    """A Chrome or YouTube icon is the one thing in a capture with saturated red."""
    px = im.load()
    for y in range(y0, y1):
        for x in range(0, im.width, 4):
            r, g, b = px[x, y][:3]
            if r > 200 and g < 80 and b < 80:
                return True
    return False


trimmed = 0
for path in TARGETS:
    raw_dir = path.parent / 'raw'
    raw_dir.mkdir(exist_ok=True)
    raw = raw_dir / path.name
    if not raw.exists():
        path.replace(raw)
    im = Image.open(raw).convert('RGB')
    w, h = im.size
    if not has_red(im, h - TASKBAR_PX, h):
        raise SystemExit(f'{raw}: no taskbar icons in the bottom {TASKBAR_PX}px, check the capture')
    if has_red(im, h - TASKBAR_PX - 40, h - TASKBAR_PX):
        raise SystemExit(f'{raw}: taskbar taller than {TASKBAR_PX}px, raise TASKBAR_PX')
    im.crop((0, 0, w, h - TASKBAR_PX)).save(path)
    trimmed += 1
    print(f'{path.relative_to(ROOT)}: {w}x{h} -> {w}x{h - TASKBAR_PX}')

print(f'Trimmed {trimmed} tablet captures; originals in captures/raw/.')
