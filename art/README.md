# Art sources

Masters and retired assets. Nothing here is bundled — Metro only bundles files
that are `require`d from source, so these cost zero bytes at runtime.

## Launch animation

`launch-animation-master.mp4` is the green-screen master (1280x720, 24fps, 10s).
Background key colour is `#0A9E1B`.

`assets/images/launch-animation.webp` is generated from it:

```sh
ffmpeg -i art/launch-animation-master.mp4 -an \
  -vf "colorkey=0x0A9E1B:0.26:0.04,despill=type=green:mix=0.5:expand=0.3,scale=720:-2:flags=lanczos,fps=15,format=bgra" \
  -c:v libwebp_anim -lossless 0 -quality 60 -cr_threshold 6 -compression_level 5 \
  -loop 0 -pix_fmt bgra \
  assets/images/launch-animation.webp
```

Three things in that command are load-bearing:

- **`format=bgra` (and `-pix_fmt bgra`)** — routing through `yuva420p` instead
  compresses the alpha plane lossily and turns the transparent background into
  alpha 1-4. Measured: 4.5% truly-transparent pixels via yuva420p, 44% via bgra.
- **`colorkey` blend of `0.04`** — the default-ish `0.12` triples edge noise
  (7.2% partial-alpha pixels vs 1.44%), which both looks worse and inflates the
  file by ~50% because WebP cannot pack noisy gradients.
- **Full 10s duration** — the orange ring makes exactly one revolution across
  the clip, so 0..239 is the only seamless loop. Any shorter cut makes the ring
  jump on repeat.

Do not use `chromakey` here; it works in YUV and leaves most of the subject at
partial alpha (only ~10% fully opaque).

`launch-animation-superseded.webm` is the previous VP9-alpha asset. It is kept
only for reference: it never worked on iOS (AVFoundation cannot demux WebM) and
rendered opaque black on Android (ExoPlayer discards WebM alpha side data).
