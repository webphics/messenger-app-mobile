# Store publishing

One folder per store. Each is self-contained: paste-ready copy, a GPT image brief with the capture
list for that platform, and the publishing checklist from today's build pipeline to a live listing.

| | Android (Google Play) | iOS (App Store) |
|---|---|---|
| Listing copy, ASO, declarations | `android/listing.md` | `ios/listing.md` |
| Image brief + captures | `android/images.md` | `ios/images.md` |
| Publishing checklist | `android/publishing.md` | `ios/publishing.md` |
| Generated art and frames | `android/assets/` | `ios/assets/` |
| Raw emulator / simulator captures | `android/captures/` | `ios/captures/` |

Shared art (empty-state illustrations P4, Offers art P5) is generated once and copied into
`assets/images` / `assets/offers` in the app; keep a copy under whichever store folder ran the
prompt.
