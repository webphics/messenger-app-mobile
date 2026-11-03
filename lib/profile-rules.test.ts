import type { ApiFailure } from "@/lib/api-result";
import {
  checkProfile,
  draftFromUser,
  hasProfileChanges,
  PROFILE_PHOTO_MAX_BYTES,
  profilePhotoUpload,
  profilePhotoUri,
  profileRefusal,
  type ProfileDraft,
} from "@/lib/profile-rules";

const ADA = { name: "Ada Lovelace", username: "ada", phone: "+447700900123" };
const draft = (over: Partial<ProfileDraft> = {}): ProfileDraft => ({
  ...draftFromUser(ADA),
  ...over,
});

describe("the form as it opens", () => {
  test("is what the API last said", () => {
    expect(draftFromUser(ADA)).toEqual({
      name: "Ada Lovelace",
      username: "ada",
      phone: "+447700900123",
    });
  });

  test("a missing username or phone is an empty field", () => {
    expect(draftFromUser({ name: "Ada", username: null, phone: null })).toEqual({
      name: "Ada",
      username: "",
      phone: "",
    });
  });
});

describe("checkProfile", () => {
  test.each([
    ["no name", { name: "" }, "name"],
    ["a name of spaces", { name: "   " }, "name"],
    ["a name past 255", { name: "a".repeat(256) }, "name"],
    ["a username past 20", { username: "a".repeat(21) }, "username"],
    ["a username with a dash", { username: "ada-l" }, "username"],
    ["a username with a space inside", { username: "ada l" }, "username"],
    ["a phone with no plus", { phone: "07700900123" }, "phone"],
    ["a phone starting +0", { phone: "+07700900123" }, "phone"],
    ["a phone too short", { phone: "+4477" }, "phone"],
    ["a phone with letters", { phone: "+44 7700 CALL" }, "phone"],
  ] as [string, Partial<ProfileDraft>, string][])(
    "%s is refused on its own field",
    (_label, over, field) => {
      const check = checkProfile(draft(over));
      expect(check.submission).toBeNull();
      expect(check.firstError).toBe(field);
      expect(Object.keys(check.errors)).toEqual([field]);
    },
  );

  test("every field that is wrong says so, and the first in the form is focused", () => {
    const check = checkProfile({ name: "", username: "no spaces", phone: "123" });
    expect(Object.keys(check.errors).sort()).toEqual(["name", "phone", "username"]);
    expect(check.firstError).toBe("name");
  });

  test.each([
    ["a 20-character username", { username: "a".repeat(20) }],
    ["a username of digits and underscores", { username: "_007_" }],
    ["a 255-character name", { name: "a".repeat(255) }],
  ] as [string, Partial<ProfileDraft>][])("%s is accepted", (_label, over) => {
    expect(checkProfile(draft(over)).submission).not.toBeNull();
  });

  test("sends every value trimmed", () => {
    expect(
      checkProfile({ name: "  Ada  ", username: " ada_l ", phone: " +447700900123 " }).submission,
    ).toEqual({ name: "Ada", username: "ada_l", phone: "+447700900123" });
  });

  test("a blank username keeps the current one, so it is not sent at all", () => {
    const submission = checkProfile(draft({ username: "  " })).submission;
    expect(submission).not.toHaveProperty("username");
  });

  test("a blank phone clears it, so it is sent as null rather than left out", () => {
    expect(checkProfile(draft({ phone: "" })).submission).toEqual({
      name: "Ada Lovelace",
      username: "ada",
      phone: null,
    });
  });

  test.each([
    ["spaces", "+44 7700 900123"],
    ["dashes", "+1-415-555-2671"],
    ["brackets and dots", "+1 (415) 555.2671"],
  ])("a phone written with %s is sent as its digits", (_label, phone) => {
    expect(checkProfile(draft({ phone })).submission?.phone).toMatch(/^\+\d+$/);
  });
});

describe("hasProfileChanges", () => {
  test.each([
    ["the form as it opened", {}, false],
    ["a trailing space", { name: "Ada Lovelace " }, false],
    ["the username in capitals", { username: "ADA" }, false],
    ["a blank username", { username: "" }, false],
    ["the phone with spaces", { phone: "+44 7700 900123" }, false],
    ["a new name", { name: "Ada King" }, true],
    ["a new username", { username: "countess" }, true],
    ["a cleared phone", { phone: "" }, true],
    ["a new phone", { phone: "+14155552671" }, true],
  ] as [string, Partial<ProfileDraft>, boolean][])("%s: %s", (_label, over, expected) => {
    expect(hasProfileChanges(draft(over), ADA)).toBe(expected);
  });

  test("a phone typed for somebody who had none is a change", () => {
    const none = { ...ADA, phone: null };
    expect(hasProfileChanges({ ...draftFromUser(none), phone: "+14155552671" }, none)).toBe(true);
    expect(hasProfileChanges(draftFromUser(none), none)).toBe(false);
  });
});

describe("profileRefusal", () => {
  const refused = (message: string, code?: string): ApiFailure => ({
    kind: "refused",
    message,
    code,
  });

  test.each([
    ["a taken username", refused("A user with this username already exists.", "username_already_exists"), "username"],
    ["the API's phone check", refused("Phone is not a valid phone number", "validation_failed"), "phone"],
    ["the API's username check", refused("Username must match ...", "validation_failed"), "username"],
    ["the API's name check", refused("Name is required", "validation_failed"), "name"],
  ] as [string, ApiFailure, string][])("%s goes under its field", (_label, failure, field) => {
    expect(profileRefusal(failure).field).toBe(field);
  });

  test.each([
    ["a validation failure naming no field", refused("Unrecognized key: email", "validation_failed")],
    ["a ban", refused("Your account is banned.", "user_banned")],
    ["a refusal with no code", refused("Something went wrong")],
  ])("%s goes above the form, in the API's words", (_label, failure) => {
    const answer = profileRefusal(failure);
    expect(answer.field).toBeNull();
    expect(answer.message).toBe((failure as { message: string }).message);
  });

  test.each([
    ["unreachable", { kind: "unreachable" }],
    ["malformed", { kind: "malformed" }],
  ] as [string, ApiFailure][])("%s says nothing was saved, above the form", (_label, failure) => {
    const answer = profileRefusal(failure);
    expect(answer.field).toBeNull();
    expect(answer.message).toEqual(expect.any(String));
  });

  test("an expired session says nothing, since sign-in is already on its way", () => {
    expect(profileRefusal({ kind: "unauthorised" })).toEqual({ field: null, message: null });
  });
});

describe("profilePhotoUpload", () => {
  test.each([
    ["a JPEG", { uri: "file:///p.jpg", mimeType: "image/jpeg" }, "image/jpeg"],
    ["a PNG named only by its file", { uri: "file:///x", fileName: "me.PNG" }, "image/png"],
    ["a WebP named only by its URI", { uri: "file:///cache/me.webp" }, "image/webp"],
    ["a photo that says nothing about itself", { uri: "content://media/42" }, "image/jpeg"],
    ["exactly 2 MB", { uri: "file:///p.jpg", fileSize: PROFILE_PHOTO_MAX_BYTES }, "image/jpeg"],
  ])("%s is uploaded as the API's `file` field", (_label, photo, type) => {
    expect(profilePhotoUpload(photo)).toEqual({
      ok: true,
      file: { uri: photo.uri, field: "file", type },
    });
  });

  test.each([
    ["a HEIC", { uri: "file:///p.heic", mimeType: "image/heic" }],
    ["a HEIC named only by its file", { uri: "file:///x", fileName: "IMG_1.HEIC" }],
    ["an SVG", { uri: "file:///p.svg", mimeType: "image/svg+xml" }],
    ["a video", { uri: "file:///p.mp4", mimeType: "video/mp4" }],
    ["one byte past 2 MB", { uri: "file:///p.jpg", fileSize: PROFILE_PHOTO_MAX_BYTES + 1 }],
  ])("%s is refused before anything is sent", (_label, photo) => {
    expect(profilePhotoUpload(photo)).toEqual({ ok: false, message: expect.any(String) });
  });
});

describe("profilePhotoUri", () => {
  const BASE = "https://api.thechatroute.com";

  test.each([
    ["no photo", null, null],
    ["a blank photo", "  ", null],
    ["an uploaded photo's path", "/uploads/avatars/a.png", `${BASE}/uploads/avatars/a.png`],
    ["a Google photo", "https://lh3.googleusercontent.com/a/x", "https://lh3.googleusercontent.com/a/x"],
  ])("%s", (_label, image, expected) => {
    expect(profilePhotoUri(image, BASE)).toBe(expected);
  });
});
