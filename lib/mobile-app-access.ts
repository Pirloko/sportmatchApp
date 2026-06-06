import { Platform } from 'react-native'

import type { AccountType } from './types'

export const MOBILE_WEB_APP_URL = (
  process.env.EXPO_PUBLIC_SITE_URL?.trim() || 'https://www.sportmatch.cl'
).replace(/\/$/, '')

export const MOBILE_ACCESS_ALERT_TITLE = 'Acceso restringido'

/** App nativa (iOS/Android): solo jugadores. Web móvil/desktop mantiene venue/admin. */
export function isPlayerOnlyMobilePlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android'
}

export function isMobilePlayerAccount(accountType?: AccountType): boolean {
  return !accountType || accountType === 'player'
}

export function mobileAccessDeniedMessage(accountType?: AccountType): string {
  if (accountType === 'admin') {
    return 'Las cuentas de administrador solo están disponibles en la app web de SportMatch.'
  }
  if (accountType === 'venue') {
    return 'Las cuentas de centro deportivo solo están disponibles en la app web de SportMatch.'
  }
  return 'Este tipo de cuenta no tiene acceso a la app móvil.'
}

export function mobileAccessDeniedDetail(accountType?: AccountType): string {
  return `${mobileAccessDeniedMessage(accountType)} Ingresa desde ${MOBILE_WEB_APP_URL}`
}
