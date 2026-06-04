import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import {
  VenueCentroLoading,
  VenueCentroScreen,
} from '../../components/venue-centro-screen'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase/client'
import {
  fetchPublicVenuePageData,
  type PublicVenuePageData,
} from '../../lib/supabase/venue-public-queries'
import { isValidTeamInviteId } from '../../lib/team-invite-url'

export default function CentroPublicRoute() {
  const params = useLocalSearchParams<{ venueId?: string | string[] }>()
  const venueId = Array.isArray(params.venueId)
    ? params.venueId[0]
    : params.venueId

  const [data, setData] = useState<PublicVenuePageData | null | undefined>(
    undefined
  )

  useEffect(() => {
    if (!venueId || !isValidTeamInviteId(venueId) || !isSupabaseConfigured()) {
      setData(null)
      return
    }
    let cancelled = false
    void (async () => {
      const d = await fetchPublicVenuePageData(getSupabase(), venueId)
      if (!cancelled) setData(d ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [venueId])

  if (!venueId || !isValidTeamInviteId(venueId)) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Enlace de centro no válido.</Text>
      </View>
    )
  }

  if (data === undefined) {
    return <VenueCentroLoading />
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No encontramos este centro.</Text>
      </View>
    )
  }

  return <VenueCentroScreen data={data} />
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  muted: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
})
