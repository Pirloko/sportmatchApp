import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js'

import { authLog } from '../auth/auth-debug'
import { withTimeout } from '../async-with-timeout'
import type { User } from '../types'
import { buildFallbackUserFromAuth } from './auth-profile-fallback'
import { fetchProfileForUser } from './queries'

const PROFILE_FETCH_TIMEOUT_MS = 8_000

export type ResolvedAppUser = {
  user: User
  source: 'profiles' | 'fallback'
}

/**
 * Carga perfil en `profiles` o devuelve usuario mínimo si no hay fila (no deja sesión huérfana en UI).
 */
export async function resolveAppUserFromAuth(
  supabase: SupabaseClient,
  authUser: SupabaseAuthUser,
  email: string
): Promise<ResolvedAppUser> {
  authLog('Hydrate', 'fetching profile', {
    user_id: authUser.id,
    email,
  })

  const profile = await withTimeout(
    fetchProfileForUser(supabase, authUser.id, email),
    PROFILE_FETCH_TIMEOUT_MS,
    () => {
      authLog('Hydrate', 'fetchProfileForUser timeout → fallback', {
        user_id: authUser.id,
        timeout_ms: PROFILE_FETCH_TIMEOUT_MS,
      })
      return null
    }
  )

  authLog('Hydrate', 'profile result', {
    profile: profile
      ? { id: profile.id, account_type: profile.accountType, name: profile.name }
      : null,
  })

  if (profile) {
    return { user: profile, source: 'profiles' }
  }

  authLog('Hydrate', 'profile null → fallback user (sesión auth se mantiene en UI)')
  return {
    user: buildFallbackUserFromAuth(authUser, email),
    source: 'fallback',
  }
}
