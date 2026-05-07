import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'

/**
 * En Android el proceso puede matar `MainActivity` al volver de la galería.
 * Si hay selección pendiente, devuelve el primer asset (misma forma que tras `launchImageLibraryAsync`).
 */
export async function takeAndroidPendingImageAsset(): Promise<ImagePicker.ImagePickerAsset | null> {
  if (Platform.OS !== 'android') return null
  const result = await ImagePicker.getPendingResultAsync()
  if (!result || !('assets' in result) || result.canceled || !result.assets?.[0]) {
    return null
  }
  return result.assets[0]
}
