import type { SupabaseClient } from '@supabase/supabase-js'

export const PROFILE_AVATARS_BUCKET = 'profile-avatars'

export function profileAvatarStoragePath(userId: string): string {
  return `${userId}/avatar`
}

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function normalizeMime(mime: string): string {
  if (mime === 'image/jpg') return 'image/jpeg'
  return mime
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

  const response = await fetch(uri)
  const blob = await response.blob()
  if (blob.size > MAX_BYTES) {
    return { error: 'La imagen no puede superar 2 MB.' }
  }

  const path = profileAvatarStoragePath(userId)
  const { error: upErr } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType: type,
      cacheControl: '3600',
    })

  if (upErr) {
    return { error: upErr.message }
  }

  const { data } = supabase.storage.from(PROFILE_AVATARS_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl }
}
