import { Redirect } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { VenueDashboardScreen } from '../components/venue-dashboard-screen'
import { useApp } from '../lib/app-provider'

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

  return <VenueDashboardScreen />
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
})
