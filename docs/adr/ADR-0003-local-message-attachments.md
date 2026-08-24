# Local Message attachments (no upload)

Chat media is modeled as an optional `attachment` on `Message` (image | video | audio | document) with a device-local URI, not a `kind` discriminant and not an upload pipeline. We stage one attachment on the composer, then send into local thread state so captions stay optional and Phase 5b can swap URI → server id without reshaping the bubble UI.
