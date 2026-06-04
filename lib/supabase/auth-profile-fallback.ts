import type { Session, User as SupabaseAuthUser } from '@supabase/supabase-js'

import type { User } from '../types'
import { DEFAULT_AVATAR } from './mappers'

/**
 * Perfil mínimo cuando `profiles` no tiene fila (RLS, trigger de alta ausente, etc.).
 * Permite salir de “Completando inicio de sesión” con sesión auth válida.
 */
export function buildFallbackUserFromAuth(
  authUser: SupabaseAuthUser,
  email: string
): User {
  const meta = authUser.user_metadata as Record<string, unknown> | undefined
  const nameFromMeta =
    (typeof meta?.full_name === 'string' && meta.full_name) ||
    (typeof meta?.name === 'string' && meta.name) ||
    email.split('@')[0] ||
    'Usuario'

  return {
    id: authUser.id,
    email,
    name: nameFromMeta,
    age: 16,
    gender: 'male',
    position: 'mediocampista',
    level: 'intermedio',
    city: '',
    availability: [],
    photo: DEFAULT_AVATAR,
    createdAt: new Date(),
    accountType: 'player',
    missingDbProfile: true,
  }
}

export function buildFallbackUserFromSession(
  session: Session,
  email: string
): User {
  return buildFallbackUserFromAuth(session.user, email)
}
