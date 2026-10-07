# Generated ChatRoute artwork

Generated with the built-in imagegen tool from `../images.md` on 2026-10-07.

23 PNG assets:

- `feature-graphic.png`: 1024 × 500.
- `phone-01.png` through `phone-08.png`: 1080 × 1920, captions in brief order.
- `tablet-7-{1,3,4}.png`: 1200 × 1920.
- `tablet-10-{1,3,4}.png`: 1600 × 2560.
- `empty-inbox.png`, `empty-unassigned.png`, `no-signal.png`, `empty-wall.png`, `empty-search.png`, `notifications-off.png`: 1200 × 1200, transparent.
- `zero-fee.png`, `payouts.png`: 1536 × 1024.

The existing final app icon was not regenerated. Artwork is staged here; in-app assets have not been replaced.

## Real screenshot compositing

Phone and tablet screens are placeholders, not final store screenshots. Composite real app captures before upload. `manifest.json` records approximate measured inner screen bounds at the final export resolution. `visibleHeight` ends at the canvas crop; the device continues below it. Check the rounded mask against the bezel visually. Preserve or restore the centered punch-hole above the capture if needed.

Generated typography, colours, logo details, and frame placement can vary from the exact brief. The feature graphic used the brand lockup as a reference; it is not a pixel-identical pasted logo. Verify those details before final publication.

## Provenance

`prompts.json` contains the final prompt for every selected image and its original local generation path. `export.ps1` resizes the selected outputs to the requested dimensions and checks corner transparency for the empty states. All 23 outputs passed export checks. The script refuses to overwrite existing PNGs.
