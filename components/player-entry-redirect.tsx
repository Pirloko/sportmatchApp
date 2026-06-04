import AsyncStorage from '@react-native-async-storage/async-storage'
import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { readCreatePrefill } from '../lib/create-prefill'
import { useApp } from '../lib/app-provider'
import {
  OPEN_CREATE_AFTER_AUTH_KEY,
  PENDING_TEAM_FOCUS_STORAGE_KEY,
} from '../lib/storage-keys'
import { isValidTeamInviteId } from '../lib/team-invite-url'
import { useScreenTheme } from '../lib/theme-ui'

export function PlayerEntryRedirect() {
  const theme = useScreenTheme()
  const { setTeamsDetailFocusTeamId } = useApp()
  const [href, setHref] = useState<'/crear' | '/equipos' | '/home' | null>(null)

  useEffect(() => {
    void (async () => {
      const pendingTeam = await AsyncStorage.getItem(PENDING_TEAM_FOCUS_STORAGE_KEY)
      if (pendingTeam && isValidTeamInviteId(pendingTeam)) {
        await AsyncStorage.removeItem(PENDING_TEAM_FOCUS_STORAGE_KEY)
        setTeamsDetailFocusTeamId(pendingTeam)
        setHref('/equipos')
        return
      }
      const flag = await AsyncStorage.getItem(OPEN_CREATE_AFTER_AUTH_KEY)
      const prefill = await readCreatePrefill()
      if (flag === '1' && prefill) {
        await AsyncStorage.removeItem(OPEN_CREATE_AFTER_AUTH_KEY)
        setHref('/crear')
      } else {
        if (flag === '1') {
          await AsyncStorage.removeItem(OPEN_CREATE_AFTER_AUTH_KEY)
        }
        setHref('/home')
      }
    })()
  }, [setTeamsDetailFocusTeamId])

  if (href === null) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  return <Redirect href={href} />
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
