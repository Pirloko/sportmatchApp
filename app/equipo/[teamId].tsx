import AsyncStorage from '@react-native-async-storage/async-storage'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { useLayoutEffect, useRef } from 'react'

import { useApp } from '../../lib/app-provider'
import { PENDING_TEAM_FOCUS_STORAGE_KEY } from '../../lib/storage-keys'
import { isValidTeamInviteId } from '../../lib/team-invite-url'

export default function EquipoDeepLinkRoute() {
  const raw = useLocalSearchParams<{ teamId: string | string[] }>()
  const teamId = Array.isArray(raw.teamId) ? raw.teamId[0] : raw.teamId
  const { currentUser, setTeamsDetailFocusTeamId } = useApp()
  const guestSavedRef = useRef(false)

  useLayoutEffect(() => {
    if (!teamId || !isValidTeamInviteId(teamId) || !currentUser) return
    setTeamsDetailFocusTeamId(teamId)
  }, [teamId, currentUser, setTeamsDetailFocusTeamId])

  if (!teamId || !isValidTeamInviteId(teamId)) {
    return <Redirect href="/" />
  }

  if (!currentUser) {
    if (!guestSavedRef.current) {
      guestSavedRef.current = true
      void AsyncStorage.setItem(PENDING_TEAM_FOCUS_STORAGE_KEY, teamId)
    }
    return <Redirect href="/" />
  }

  return <Redirect href="/equipos" />
}
