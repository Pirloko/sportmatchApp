import { Alert } from 'react-native'

import type { JoinMatchResult } from './supabase/join-match-opportunity'

export function alertJoinResult(r: JoinMatchResult) {
  if (r.ok) return
  if ('kind' in r && r.kind === 'info') {
    Alert.alert('Atención', r.message)
    return
  }
  if ('error' in r) Alert.alert('Atención', r.error)
}
