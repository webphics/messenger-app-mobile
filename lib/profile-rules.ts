import type { UploadFile } from "@/lib/api-client";
import type { ApiFailure } from "@/lib/api-result";
import { resolveAttachmentUrl } from "@/lib/attachment-view";
import type { SessionUser } from "@/lib/types";

/**
 * Editing your own name, username, phone and photo.
 *
 * Pure and table-tested, beside `components/settings/account-profile-screen`,
 * which owns the drawing, and `lib/profile-api`, which owns the three paths.
 * The split `lib/password-rules` has, for its reason: nothing here imports
 * anything native, so the rules the form turns on are a table of cases.
 *
 * The rules come from `PUT /auth/profile` and the avatar routes in the API's
 * `auth.controller.ts`, and from the web client's profile form, which this
 * screen mirrors:
 *
 * 1. **A name is required and is 1 to 255 characters.** The route is a
 *    replace rather than a patch, so there is no saving without one.
 * 2. **A username is 1 to 20 letters, numbers or underscores, and a blank one
 *    keeps the current username.** The API leaves the username alone when the
 *    body has none, which is the only way to say "unchanged", and the web form
 *    drops a blank field for the same reason. So blank is never an error here
 *    and never reaches the wire.
 * 3. **A phone is optional, in international form, and a blank one clears
 *    it.** The opposite of the username, because the route writes
 *    `phone ?? null` whatever the body says — which is also why the submission
 *    always carries one. Spaces, dashes, dots and brackets are taken out before
 *    the check, so `+44 7700 900123` is the number somebody meant rather than a
 *    refusal. The API's own check (`libphonenumber-js`) is stricter than the
 *    shape checked here and has the last word.
 * 4. **A photo is a JPEG, PNG, GIF or WebP of 2 MB or less.** The API's
 *    `INLINE_IMAGE_MIME_TYPES` and `MAX_USER_AVATAR_BYTES`; SVG is refused
 *    there on purpose.
 */

/** From `PUT /auth/profile`'s body schema. */
export const NAME_MAX_LENGTH = 255;
/** From the API's `username.helper.ts`, which every username path shares. */
export const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
/** E.164's shape: a plus, then 8 to 15 digits not starting with 0. The web form's check. */
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
/** What a person types between digits and means nothing by. */
const PHONE_SEPARATORS = /[\s\-().]/g;

/** `MAX_USER_AVATAR_BYTES` in the API's `conversations.upload.ts`. */
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
/** `INLINE_IMAGE_MIME_TYPES`, which `userAvatarFileFilter` allows. */
const PROFILE_PHOTO_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export const USERNAME_HINT = `1 to ${USERNAME_MAX_LENGTH} letters, numbers or underscores. Leave blank to keep the current one.`;
export const PHONE_HINT = "International format, for example +14155552671. Leave blank to remove it.";

/** The fields this form can have, in the order they appear. */
export type ProfileField = "name" | "username" | "phone";
export const PROFILE_FIELDS: readonly ProfileField[] = ["name", "username", "phone"];

/** What is in the form, exactly as typed. */
export type ProfileDraft = Record<ProfileField, string>;

/** The form as it opens: what the API last said about this person. */
export function draftFromUser(
  user: Pick<SessionUser, "name" | "username" | "phone">,
): ProfileDraft {
  return { name: user.name, username: user.username ?? "", phone: user.phone ?? "" };
}

/**
 * Exactly what goes over the wire.
 *
 * `username` is absent rather than empty when the field was left blank (rule
 * 2), and `phone` is always present (rule 3). The body is a `z.strictObject` on
 * the API's side, so nothing else may ride along.
 */
export type ProfileSubmission = {
  name: string;
  username?: string;
  phone: string | null;
};

export type ProfileCheck = {
  errors: Partial<Record<ProfileField, string>>;
  /** The field to focus on a failed submit, or null when nothing is wrong. */
  firstError: ProfileField | null;
  /** The body to send, or null when this form may not be submitted yet. */
  submission: ProfileSubmission | null;
};

function normalisedPhone(value: string): string {
  return value.replace(PHONE_SEPARATORS, "");
}

function nameError(name: string): string | null {
  if (name === "") return "Enter your name.";
  if (name.length > NAME_MAX_LENGTH) return `Use ${NAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

function usernameError(username: string): string | null {
  if (username === "") return null;
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Use ${USERNAME_MAX_LENGTH} characters or fewer.`;
  }
  if (!USERNAME_PATTERN.test(username)) return "Use only letters, numbers and underscores.";
  return null;
}

function phoneError(phone: string): string | null {
  if (phone === "") return null;
  return PHONE_PATTERN.test(phone)
    ? null
    : "Enter the number in international format, starting with + and the country code.";
}

/**
 * Whether this form may be submitted yet, and if not what is wrong with which
 * field.
 *
 * Every value is trimmed first, as the API trims it, so a trailing space a
 * keyboard added is neither an error nor a change.
 */
export function checkProfile(draft: ProfileDraft): ProfileCheck {
  const name = draft.name.trim();
  const username = draft.username.trim();
  const phone = normalisedPhone(draft.phone.trim());

  const errors: Partial<Record<ProfileField, string>> = {};
  const found: Record<ProfileField, string | null> = {
    name: nameError(name),
    username: usernameError(username),
    phone: phoneError(phone),
  };
  for (const field of PROFILE_FIELDS) {
    const error = found[field];
    if (error) errors[field] = error;
  }

  const firstError = PROFILE_FIELDS.find((field) => errors[field] !== undefined) ?? null;
  if (firstError !== null) return { errors, firstError, submission: null };

  return {
    errors,
    firstError: null,
    submission: {
      name,
      ...(username === "" ? {} : { username }),
      phone: phone === "" ? null : phone,
    },
  };
}

/**
 * Whether the draft says anything the API does not already hold.
 *
 * Compared the way the API would store it — trimmed, the phone without its
 * separators, the username lower-cased — so retyping a value in a different
 * shape is not a change. A blank username is never a change, because it keeps
 * the current one.
 */
export function hasProfileChanges(
  draft: ProfileDraft,
  user: Pick<SessionUser, "name" | "username" | "phone">,
): boolean {
  const username = draft.username.trim().toLowerCase();
  const phone = normalisedPhone(draft.phone.trim());
  return (
    draft.name.trim() !== user.name ||
    (username !== "" && username !== (user.username ?? "")) ||
    (phone === "" ? null : phone) !== user.phone
  );
}

/** Which field the API's refusal is about, read off its message's first word. */
const FIELD_BY_MESSAGE_PREFIX: readonly [string, ProfileField][] = [
  ["name", "name"],
  ["username", "username"],
  ["phone", "phone"],
];

/**
 * Where a refused save is shown: under the field it is about, or above the form.
 *
 * A taken username is the refusal that matters most — somebody can claim it
 * between this screen opening and the save — and it is a `409` with its own
 * code. A `422` names its field in the first word of its sentence (`Phone is
 * not a valid phone number`), which is what puts the phone check the API makes
 * and this file does not under the phone.
 */
export function profileRefusal(
  failure: ApiFailure,
): { field: ProfileField; message: string } | { field: null; message: string | null } {
  switch (failure.kind) {
    case "refused": {
      if (failure.code === "username_already_exists") {
        return { field: "username", message: "Someone else has this username. Try another." };
      }
      if (failure.code === "validation_failed") {
        const first = failure.message.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        const match = FIELD_BY_MESSAGE_PREFIX.find(([prefix]) => first === prefix);
        if (match) return { field: match[1], message: failure.message };
      }
      return { field: null, message: failure.message };
    }
    case "unreachable":
      return {
        field: null,
        message: "Could not reach the server, so nothing was saved. Check your connection and try again.",
      };
    case "malformed":
      return {
        field: null,
        message: "The server answered with something this app did not understand. Your profile may not have changed.",
      };
    case "unauthorised":
      // The auth layer is already on its way to sign-in.
      return { field: null, message: null };
  }
}

/** What the picker reported about the photo somebody chose. */
export type PickedPhoto = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

function photoType(photo: PickedPhoto): string {
  const reported = photo.mimeType?.trim().toLowerCase();
  if (reported) return reported;
  const name = photo.fileName ?? photo.uri.split(/[?#]/)[0] ?? "";
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  // The cropper writes a JPEG, so a photo that says nothing about itself is one.
  return TYPE_BY_EXTENSION[extension] ?? "image/jpeg";
}

/**
 * The upload for a picked photo, or why it cannot be one.
 *
 * Checked here rather than left to the API so that a photo the API would
 * refuse is never sent: a 2 MB upload over a weak connection is a long wait to
 * be told no.
 */
export function profilePhotoUpload(
  photo: PickedPhoto,
): { ok: true; file: UploadFile } | { ok: false; message: string } {
  const type = photoType(photo);
  if (!PROFILE_PHOTO_TYPES.has(type)) {
    return { ok: false, message: "Choose a JPEG, PNG, GIF or WebP photo." };
  }
  if (photo.fileSize != null && photo.fileSize > PROFILE_PHOTO_MAX_BYTES) {
    return { ok: false, message: "Choose a photo of 2 MB or less." };
  }
  return { ok: true, file: { uri: photo.uri, field: "file", type } };
}

/**
 * The address to draw a profile photo from, or null for initials.
 *
 * A photo uploaded here or on the web is stored as a path under
 * `/uploads/avatars`, which a device has no origin to resolve against; one a
 * Google sign-in brought is already absolute. `resolveAttachmentUrl` is the
 * rule every other stored file in this app is drawn through.
 */
export function profilePhotoUri(
  image: string | null | undefined,
  baseUrl?: string,
): string | null {
  const value = image?.trim();
  if (!value) return null;
  return baseUrl === undefined ? resolveAttachmentUrl(value) : resolveAttachmentUrl(value, baseUrl);
}
