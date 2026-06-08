import { Redirect } from 'expo-router'
import { lazy, Suspense } from 'react'
import { BallLoadingIndicator } from '../components/ball-loading-indicator'
import { useApp } from '../lib/app-provider'
import { isPlayerOnlyMobilePlatform } from '../lib/mobile-app-access'

const VenueDashboardScreen = lazy(() =>
  import('../components/venue-dashboard-screen').then((m) => ({
    default: m.VenueDashboardScreen,
  }))
)

export default function MiCentroRoute() {
  const { currentUser, authLoading } = useApp()

  if (isPlayerOnlyMobilePlatform()) {
    return <Redirect href="/" />
  }

  if (authLoading) {
    return <BallLoadingIndicator fullScreen size="lg" />
  }

  if (!currentUser || currentUser.accountType !== 'venue') {
    return <Redirect href="/" />
  }

  return (
    <Suspense fallback={<BallLoadingIndicator fullScreen size="lg" />}>
      <VenueDashboardScreen />
    </Suspense>
  )
}

