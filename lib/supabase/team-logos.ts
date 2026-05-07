import type { SupabaseClient } from '@supabase/supabase-js'

export const TEAM_LOGOS_BUCKET = 'team-logos'

export function teamLogoStoragePath(teamId: string): string {
  return `${teamId}/logo`
}

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function normalizeMime(mime: string): string {
  if (mime === 'image/jpg') return 'image/jpeg'
  return mime
}

export async function uploadTeamLogoFromUri(
  supabase: SupabaseClient,
  teamId: string,
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

  const path = teamLogoStoragePath(teamId)
  const { error: upErr } = await supabase.storage
    .from(TEAM_LOGOS_BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType: type,
      cacheControl: '3600',
    })

  if (upErr) {
    return { error: upErr.message }
  }

  const { data } = supabase.storage.from(TEAM_LOGOS_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl }
}

export async function deleteTeamLogoFile(
  supabase: SupabaseClient,
  teamId: string
): Promise<{ ok: true } | { error: string }> {
  const path = teamLogoStoragePath(teamId)
  const { error } = await supabase.storage.from(TEAM_LOGOS_BUCKET).remove([path])
  if (error) {
    return { error: error.message }
  }
  return { ok: true }
}
