# A file is streamed, not serialised

An attachment is uploaded through `expo-file-system`'s native uploader — `File#upload` with
`UploadType.MULTIPART` — rather than through `fetch` with a `FormData`. It is still an
`apiRequest`: the Session cookie, the CSRF pair and the single retry are built above it and handed
in, so only the transport differs. See `sendFile` in `lib/api-client.ts`.

Two things force it. This runtime's `fetch` is Expo's, and its `FormData` accepts a string, a
`Blob`, or anything with `bytes()` — every one of which is the file *already in memory*. React
Native's old `{ uri, name, type }` part, which streamed from disk, is not one of them; passing one
throws `Unsupported FormDataPart implementation`. And even if it were accepted, the API takes
fifteen megabytes, which through `fetch` would mean holding the file and then the whole multipart
body around it in a phone's JavaScript heap.

The cost is that one endpoint does not go through `fetch`, so its answer arrives as
`{ status, body, headers }` rather than as a `Response` and has to be read into the same `Answer`
shape by hand. That is a dozen lines in one place, against every upload in the app being bounded by
available memory.

Supersedes the "no upload pipeline" half of
[ADR-0003](./ADR-0003-local-message-attachments.md): the bubble shape it chose is unchanged, and the
device URI it stored is now what an upload starts from rather than what a message keeps.
