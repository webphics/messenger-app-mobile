import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

export type AttachmentKind = "image" | "video" | "document";

export type PickedAttachment = {
  uri: string;
  name: string;
  /** Bytes, when the platform reports it. */
  size: number | null;
  kind: AttachmentKind;
};

/**
 * Every picker resolves to one of these. `denied` is distinct from `cancelled`
 * so the caller can explain the permission instead of silently doing nothing.
 */
export type AttachmentOutcome =
  | { status: "picked"; attachment: PickedAttachment }
  | { status: "cancelled" }
  | { status: "denied"; scope: "camera" | "library" };

const KB = 1024;

/** Human-readable byte size. Returns null when the platform gave us nothing. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < KB) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / KB;
  let unit = 0;
  while (value >= KB && unit < units.length - 1) {
    value /= KB;
    unit += 1;
  }
  // One decimal below 10 (1.4 MB), none above it (12 MB).
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${units[unit]}`;
}

/** Last path segment of a URI, minus any query string. */
export function fileNameFromUri(uri: string, fallback: string): string {
  const withoutQuery = uri.split("?")[0];
  const segment = withoutQuery.substring(withoutQuery.lastIndexOf("/") + 1);
  return segment.length > 0 ? decodeURIComponent(segment) : fallback;
}

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: "image",
  video: "video",
  document: "document",
};

/**
 * Composer text for a picked file. Phase 2 has no attachment field on `Message`,
 * so the file is described inline; swap this for a real upload when the message
 * model grows one.
 */
export function describeAttachment(attachment: PickedAttachment): string {
  const size = formatBytes(attachment.size);
  const suffix = size ? ` · ${size}` : "";
  return `[Attached ${KIND_LABEL[attachment.kind]}: ${attachment.name}${suffix}]`;
}

function assetKind(type: string | null | undefined): AttachmentKind {
  return type === "video" || type === "pairedVideo" ? "video" : "image";
}

function toAttachment(asset: ImagePicker.ImagePickerAsset): PickedAttachment {
  const kind = assetKind(asset.type);
  return {
    uri: asset.uri,
    name: asset.fileName ?? fileNameFromUri(asset.uri, `${kind}.jpg`),
    size: asset.fileSize ?? null,
    kind,
  };
}

/** Photo or video from the device library. */
export async function pickFromLibrary(): Promise<AttachmentOutcome> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: "denied", scope: "library" };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 0.8,
  });
  if (result.canceled || result.assets.length === 0) return { status: "cancelled" };

  return { status: "picked", attachment: toAttachment(result.assets[0]) };
}

/** A freshly captured photo. */
export async function capturePhoto(): Promise<AttachmentOutcome> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: "denied", scope: "camera" };

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.8,
  });
  if (result.canceled || result.assets.length === 0) return { status: "cancelled" };

  return { status: "picked", attachment: toAttachment(result.assets[0]) };
}

/** Any document the OS file provider exposes. Needs no runtime permission. */
export async function pickDocument(): Promise<AttachmentOutcome> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
  });
  if (result.canceled || result.assets.length === 0) return { status: "cancelled" };

  const asset = result.assets[0];
  return {
    status: "picked",
    attachment: {
      uri: asset.uri,
      name: asset.name || fileNameFromUri(asset.uri, "document"),
      size: asset.size ?? null,
      kind: "document",
    },
  };
}
