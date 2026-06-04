import type { SupabaseClient } from '@supabase/supabase-js'

import { authLog } from '../auth/auth-debug'
import type { OnboardingData, User } from '../types'
import { buildFallbackUserFromAuth } from './auth-profile-fallback'
import { fetchProfileForUser } from './queries'

/**
 * Crea o actualiza la fila en `profiles` tras onboarding (jugador sin fila previa).
 * Resuelve el bug `UPDATE` en 0 filas cuando `missingDbProfile === true`.
 */
export async function savePlayerProfileFromOnboarding(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  data: OnboardingData
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const photo = data.photo?.trim()
  if (!photo) {
    return { ok: false, error: 'La foto de perfil es obligatoria.' }
  }
  const city = data.city.trim() || 'Rancagua'
  const whatsapp = data.whatsappPhone.trim()
  const birthDate = data.birthDate?.trim() || null

  const row: Record<string, unknown> = {
    id: userId,
    name: data.name.trim(),
    age: data.age,
    gender: data.gender,
    whatsapp_phone: whatsapp,
    position: data.position,
    level: data.level,
    city,
    availability: data.availability ?? [],
    photo_url: photo,
    account_type: 'player' as const,
  }
  if (birthDate) row.birth_date = birthDate
  if (data.cityId) row.city_id = data.cityId

  authLog('Hydrate', 'upsert profiles', {
    user_id: userId,
    had_missing_db_profile: true,
  })

  const { error } = await supabase.from('profiles').upsert(row, {
    onConflict: 'id',
  })

  if (error) {
    authLog('Hydrate', 'upsert profiles error', {
      message: error.message,
      code: error.code,
    })
    return { ok: false, error: error.message }
  }

  const profile = await fetchProfileForUser(supabase, userId, email)
  if (profile) {
    authLog('Hydrate', 'upsert OK, profile reloaded from DB', {
      user_id: profile.id,
    })
    return { ok: true, user: profile }
  }

  authLog('Hydrate', 'upsert OK pero SELECT vacío — usando estado local sin missingDbProfile')
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  const base = authUser
    ? buildFallbackUserFromAuth(authUser, email)
    : {
        id: userId,
        email,
        name: row.name,
        age: row.age,
        gender: row.gender,
        position: row.position,
        level: row.level,
        city: row.city,
        availability: row.availability,
        photo,
        createdAt: new Date(),
        accountType: 'player' as const,
        missingDbProfile: false,
      }

  return {
    ok: true,
    user: {
      ...base,
      ...data,
      id: userId,
      email,
      whatsappPhone: whatsapp,
      photo,
      city,
      missingDbProfile: false,
    },
  }
}
