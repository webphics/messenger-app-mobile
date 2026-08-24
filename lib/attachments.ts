import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

import type { AttachmentKind, MessageAttachment } from '@/lib/types'

export type PickedAttachment = MessageAttachment & {
  kind: Exclude<AttachmentKind, 'audio'>
}

/** After a platform permission request: proceed, soft deny, or Settings-only. */
export type PermissionOutcome = 'proceed' | 'denied-askable' | 'denied-settings'

export function classifyPermissionOutcome(permission: {
  granted: boolean
  canAskAgain: boolean
}): PermissionOutcome {
  if (permission.granted) return 'proceed'
  if (permission.canAskAgain) return 'denied-askable'
  return 'denied-settings'
}

/**
 * Every picker resolves to one of these. `denied` is distinct from `cancelled`
 * so the caller can explain Settings-only denial without lecturing askable denials.
 */
export type AttachmentOutcome =
  | { status: 'picked'; attachment: PickedAttachment }
  | { status: 'cancelled' }
  | {
      status: 'denied'
      scope: 'camera' | 'library'
      reason: Exclude<PermissionOutcome, 'proceed'>
    }

const KB = 1024

/** Human-readable byte size. Returns null when the platform gave us nothing. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < KB) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / KB
  let unit = 0
  while (value >= KB && unit < units.length - 1) {
    value /= KB
    unit += 1
  }
  // One decimal below 10 (1.4 MB), none above it (12 MB).
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value)
  return `${rounded} ${units[unit]}`
}

/** Last path segment of a URI, minus any query string. */
export function fileNameFromUri(uri: string, fallback: string): string {
  const withoutQuery = uri.split('?')[0]
  const segment = withoutQuery.substring(withoutQuery.lastIndexOf('/') + 1)
  return segment.length > 0 ? decodeURIComponent(segment) : fallback
}

function assetKind(type: string | null | undefined): 'image' | 'video' {
  return type === 'video' || type === 'pairedVideo' ? 'video' : 'image'
}

function toAttachment(asset: ImagePicker.ImagePickerAsset): PickedAttachment {
  const kind = assetKind(asset.type)
  return {
    uri: asset.uri,
    name: asset.fileName ?? fileNameFromUri(asset.uri, `${kind}.jpg`),
    size: asset.fileSize ?? null,
    kind,
    durationMs:
      kind === 'video' && asset.duration != null
        ? Math.round(asset.duration * 1000)
        : undefined,
  }
}

/** Photo or video from the device library. */
export async function pickFromLibrary(): Promise<AttachmentOutcome> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  const outcome = classifyPermissionOutcome(permission)
  if (outcome !== 'proceed') {
    return { status: 'denied', scope: 'library', reason: outcome }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.8,
  })
  if (result.canceled || result.assets.length === 0) return { status: 'cancelled' }

  return { status: 'picked', attachment: toAttachment(result.assets[0]!) }
}

/** A freshly captured photo. */
export async function capturePhoto(): Promise<AttachmentOutcome> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  const outcome = classifyPermissionOutcome(permission)
  if (outcome !== 'proceed') {
    return { status: 'denied', scope: 'camera', reason: outcome }
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  })
  if (result.canceled || result.assets.length === 0) return { status: 'cancelled' }

  return { status: 'picked', attachment: toAttachment(result.assets[0]!) }
}

/** Any document the OS file provider exposes. Needs no runtime permission. */
export async function pickDocument(): Promise<AttachmentOutcome> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  })
  if (result.canceled || result.assets.length === 0) return { status: 'cancelled' }

  const asset = result.assets[0]!
  return {
    status: 'picked',
    attachment: {
      uri: asset.uri,
      name: asset.name || fileNameFromUri(asset.uri, 'document'),
      size: asset.size ?? null,
      kind: 'document',
    },
  }
}
