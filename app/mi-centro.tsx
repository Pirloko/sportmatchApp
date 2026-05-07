import { Redirect } from 'expo-router'
import { lazy, Suspense } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useApp } from '../lib/app-provider'

const VenueDashboardScreen = lazy(() =>
  import('../components/venue-dashboard-screen').then((m) => ({
    default: m.VenueDashboardScreen,
  }))
)

export default function MiCentroRoute() {
  const { currentUser, authLoading } = useApp()

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!currentUser || currentUser.accountType !== 'venue') {
    return <Redirect href="/" />
  }

  return (
    <Suspense
      fallback={
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      }
    >
      <VenueDashboardScreen />
    </Suspense>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
})
