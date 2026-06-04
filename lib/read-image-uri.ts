import { File } from 'expo-file-system'

/**
 * En React Native, `fetch('file://…')` suele fallar con "Network request failed".
 * Leemos la URI local con expo-file-system y subimos ArrayBuffer a Supabase.
 */
export async function readImageUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const trimmed = uri.trim()
  if (!trimmed) {
    throw new Error('URI de imagen vacía.')
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const response = await fetch(trimmed)
    if (!response.ok) {
      throw new Error(`No se pudo descargar la imagen (${response.status}).`)
    }
    return response.arrayBuffer()
  }

  try {
    const file = new File(trimmed)
    return await file.arrayBuffer()
  } catch {
    throw new Error(
      'No se pudo leer la foto del dispositivo. Vuelve a elegirla desde la galería.'
    )
  }
}
