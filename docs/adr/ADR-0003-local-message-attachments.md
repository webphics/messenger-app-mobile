# Local Message attachments (no upload)

Chat media is modeled as an optional `attachment` on `Message` (image | video | audio | document) with a device-local URI, not a `kind` discriminant and not an upload pipeline. We stage one attachment on the composer, then send into local thread state so captions stay optional and Phase 5b can swap URI → server id without reshaping the bubble UI.

**Update (#35).** The upload arrived, and the shape held: `AttachmentView` is still what a bubble
draws and what a picker produces, and the device URI it stores is now where an upload starts rather
than where a message ends. What changed is that a sent attachment is replaced by the object the API
answered with before the message naming it goes out. How the file gets there is
[ADR-0007](./ADR-0007-a-file-is-streamed-not-serialised.md).
