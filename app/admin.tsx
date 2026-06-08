import { Redirect } from 'expo-router'
import { BallLoadingIndicator } from '../components/ball-loading-indicator'
import { AdminDashboardScreen } from '../components/admin-dashboard-screen'
import { useApp } from '../lib/app-provider'
import { isPlayerOnlyMobilePlatform } from '../lib/mobile-app-access'

export default function AdminRoute() {
  const { currentUser, authLoading } = useApp()

  if (isPlayerOnlyMobilePlatform()) {
    return <Redirect href="/" />
  }

  if (authLoading) {
    return <BallLoadingIndicator fullScreen size="lg" />
  }

  if (!currentUser || currentUser.accountType !== 'admin') {
    return <Redirect href="/" />
  }

  return <AdminDashboardScreen />
}

