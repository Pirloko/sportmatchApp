import type { SupabaseClient } from '@supabase/supabase-js'

import { readImageUriAsArrayBuffer } from '../read-image-uri'

export const PROFILE_AVATARS_BUCKET = 'profile-avatars'

export function profileAvatarStoragePath(userId: string): string {
  return `${userId}/avatar`
}

/** Misma ruta en Storage → misma URL pública; sin esto la app y el CDN muestran la foto anterior. */
export function withAvatarCacheBuster(publicUrl: string, version?: number): string {
  const base = publicUrl.split('?')[0]?.split('#')[0] ?? publicUrl
  const v = version ?? Date.now()
  return `${base}?v=${v}`
}

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function normalizeMime(mime: string): string {
  if (mime === 'image/jpg') return 'image/jpeg'
  return mime
}

function friendlyUploadError(message: string): string {
  if (message.includes('Network request failed')) {
    return 'Sin conexión o no se pudo leer la foto. Revisa internet y vuelve a elegir la imagen.'
  }
  if (message.includes('Bucket not found')) {
    return 'El bucket profile-avatars no existe en Supabase Storage.'
  }
  if (message.toLowerCase().includes('row-level security')) {
    return 'No tienes permiso para subir la foto. Inicia sesión de nuevo.'
  }
  return message
}

/** Expo / RN: URI local o remota tras `expo-image-picker`. */
export async function uploadProfileAvatarFromUri(
  supabase: SupabaseClient,
  userId: string,
  uri: string,
  mimeType: string,
  fileSize?: number | null
): Promise<{ publicUrl: string } | { error: string }> {
  const type = normalizeMime(mimeType)
  if (!ALLOWED.includes(type)) {
    return { error: 'Usa una imagen JPG, PNG, WebP o GIF.' }
  }
  if (fileSize != null && fileSize > MAX_BYTES) {
    return { error: 'La imagen no puede superar 2 MB.' }
  }

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await readImageUriAsArrayBuffer(uri)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo leer la imagen.'
    return { error: friendlyUploadError(msg) }
  }

  if (arrayBuffer.byteLength > MAX_BYTES) {
    return { error: 'La imagen no puede superar 2 MB.' }
  }

  const path = profileAvatarStoragePath(userId)
  const { error: upErr } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .upload(path, arrayBuffer, {
      upsert: true,
      contentType: type,
      cacheControl: '60',
    })

  if (upErr) {
    return { error: friendlyUploadError(upErr.message) }
  }

  const { data } = supabase.storage.from(PROFILE_AVATARS_BUCKET).getPublicUrl(path)
  return { publicUrl: withAvatarCacheBuster(data.publicUrl) }
}
