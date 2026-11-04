import * as ImagePicker from 'expo-image-picker'

import type { PickedPhoto } from '@/lib/profile-rules'

/**
 * A photo from the device library, cropped square, for the profile.
 *
 * The composer's `pickFromLibrary` with two differences: images only, and the
 * platform's own cropper, so what is uploaded is the square an avatar draws
 * rather than whatever the camera framed. The crop also writes a JPEG, which
 * is what turns an iPhone's HEIC into a type the avatar route accepts.
 *
 * Asks for no permission, for the composer's reason: Android opens the system
 * Photo Picker and iOS opens PHPicker, and `app.json` blocks the media library
 * permissions Google Play would refuse.
 *
 * Null when somebody backed out. Whether the photo is one the API will take is
 * `profilePhotoUpload`'s question, not this one's.
 */
export async function pickProfilePhoto(): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  })
  if (result.canceled || result.assets.length === 0) return null

  const asset = result.assets[0]!
  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
  }
}
