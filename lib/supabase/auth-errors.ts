import type { AuthError } from '@supabase/supabase-js'

/** Mensaje legible para el usuario a partir del error de Auth de Supabase. */
export function formatAuthError(error: AuthError): string {
  const raw = (error.message || '').toLowerCase()

  if (raw.includes('already registered') || raw.includes('already been registered')) {
    return 'Ese correo ya está registrado. Prueba iniciar sesión o usa otro email.'
  }
  if (raw.includes('password') && (raw.includes('least') || raw.includes('6'))) {
    return 'La contraseña no cumple la longitud mínima (revisa en Supabase: Authentication → Providers → Email).'
  }
  if (raw.includes('invalid') && raw.includes('email')) {
    return 'El correo electrónico no es válido.'
  }
  if (raw.includes('signup') && raw.includes('disabled')) {
    return 'El registro está desactivado en el proyecto Supabase.'
  }
  if (raw.includes('rate limit') || raw.includes('too many')) {
    return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  }

  return error.message || `Error de autenticación (${error.status ?? '?'})`
}
