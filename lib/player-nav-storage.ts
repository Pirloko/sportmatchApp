import AsyncStorage from '@react-native-async-storage/async-storage'

import { PLAYER_LAST_NAV_STORAGE_KEY } from './storage-keys'

export type PlayerNavId =
  | 'home'
  | 'explore'
  | 'matches'
  | 'create'
  | 'teams'
  | 'ranking'
  | 'profile'

const IDS = new Set<PlayerNavId>([
  'home',
  'explore',
  'matches',
  'create',
  'teams',
  'ranking',
  'profile',
])

export function isPlayerNavId(v: string): v is PlayerNavId {
  return IDS.has(v as PlayerNavId)
}

export async function persistPlayerLastNav(id: PlayerNavId): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAYER_LAST_NAV_STORAGE_KEY, id)
  } catch {
    // ignore
  }
}

export async function readPlayerLastNav(): Promise<PlayerNavId | null> {
  try {
    const v = await AsyncStorage.getItem(PLAYER_LAST_NAV_STORAGE_KEY)
    if (!v || !isPlayerNavId(v)) return null
    return v
  } catch {
    return null
  }
}
