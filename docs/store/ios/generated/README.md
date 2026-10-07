# ChatRoute iOS artwork

19 PNG exports from `../images.md`: seven iPhone frames at 1320 × 2868, three iPad frames at 2064 × 2752 (captions 1, 3, 4), six shared transparent empty states at 1200 × 1200, two shared offer images at 1536 × 1024, and the existing app icon flattened onto white at 1024 × 1024 without alpha.

The ten device frames were generated with the built-in image generation tool. The eight P4/P5 assets reuse the previously generated Android artwork as the brief requests. The app icon was exported from the existing final icon, without regeneration. App runtime assets were not changed.

Exact generation prompts and source paths are in `prompts.json`. `manifest.json` records dimensions, transparency and approximate visible inner screen rectangles for compositing. Screen heights describe the visible cropped portion. Confirm the rounded mask against each bezel and preserve the phone cutout over the capture. Frame geometry and generated typography vary slightly between images; these are artwork exports rather than an exact template system.

These frames are not finished App Store screenshots. Composite real app captures into the blank screens before submission. No UI, push screenshot, Android feature graphic or preview video was generated.

`export.ps1` performs size and transparency export checks and refuses to overwrite existing PNGs.
