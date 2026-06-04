import type { SupabaseClient } from '@supabase/supabase-js'

import { readImageUriAsArrayBuffer } from '../read-image-uri'
import { DEFAULT_AVATAR } from './mappers'

export const TEAM_LOGOS_BUCKET = 'team-logos'

export function teamLogoStoragePath(teamId: string): string {
  return `${teamId}/logo`
}

/** URL pública del escudo en Storage (bucket `team-logos`). */
export function teamLogoPublicStorageUrl(
  supabase: SupabaseClient,
  teamId: string
): string {
  const { data } = supabase.storage
    .from(TEAM_LOGOS_BUCKET)
    .getPublicUrl(teamLogoStoragePath(teamId))
  return data.publicUrl
}

/**
 * Preferir `logo_url` de la BD; si falta, usar URL pública del bucket
 * (visible para cualquier usuario autenticado que vea el partido).
 */
export function isPlaceholderAvatarUrl(url: string | null | undefined): boolean {
  const trimmed = (url ?? '').trim()
  if (!trimmed) return true
  if (trimmed === DEFAULT_AVATAR) return true
  return trimmed.includes('images.unsplash.com/photo-1507003211169')
}

export function resolveTeamLogoDisplayUrl(
  supabase: SupabaseClient,
  teamId: string,
  logoUrlFromDb: string | null | undefined
): string {
  const trimmed = (logoUrlFromDb ?? '').trim()
  if (
    (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
    !isPlaceholderAvatarUrl(trimmed)
  ) {
    return trimmed
  }
  if (!teamId || teamId.startsWith('unknown')) {
    return ''
  }
  return teamLogoPublicStorageUrl(supabase, teamId)
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

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await readImageUriAsArrayBuffer(uri)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo leer la imagen.'
    return { error: msg }
  }
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return { error: 'La imagen no puede superar 2 MB.' }
  }

  const path = teamLogoStoragePath(teamId)
  const { error: upErr } = await supabase.storage
    .from(TEAM_LOGOS_BUCKET)
    .upload(path, arrayBuffer, {
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
