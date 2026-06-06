import { Redirect } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { AdminDashboardScreen } from '../components/admin-dashboard-screen'
import { useApp } from '../lib/app-provider'
import { isPlayerOnlyMobilePlatform } from '../lib/mobile-app-access'

export default function AdminRoute() {
  const { currentUser, authLoading } = useApp()

  if (isPlayerOnlyMobilePlatform()) {
    return <Redirect href="/" />
  }

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!currentUser || currentUser.accountType !== 'admin') {
    return <Redirect href="/" />
  }

  return <AdminDashboardScreen />
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
})
