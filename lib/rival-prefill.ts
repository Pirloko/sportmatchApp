import AsyncStorage from '@react-native-async-storage/async-storage'

import { RIVAL_TARGET_TEAM_STORAGE_KEY } from './storage-keys'

export async function saveRivalTargetTeamId(teamId: string): Promise<void> {
  await AsyncStorage.setItem(RIVAL_TARGET_TEAM_STORAGE_KEY, teamId)
}

export async function consumeRivalTargetTeamId(): Promise<string | null> {
  const v = await AsyncStorage.getItem(RIVAL_TARGET_TEAM_STORAGE_KEY)
  if (v) await AsyncStorage.removeItem(RIVAL_TARGET_TEAM_STORAGE_KEY)
  return v
}
