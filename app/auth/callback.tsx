import { Redirect, router } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useApp } from '../../lib/app-provider'

/**
 * Tras OAuth, el sistema abre sportmatch://auth/callback?code=….
 * No redirigir al instante a /: el intercambio del código ocurre en loginWithGoogle;
 * aquí esperamos a que exista sesión antes de volver al gate raíz.
 */
export default function AuthCallbackScreen() {
  const { authLoading, isAuthenticated } = useApp()

  useEffect(() => {
    if (authLoading || isAuthenticated) return
    const t = setTimeout(() => {
      router.replace('/')
    }, 8000)
    return () => clearTimeout(t)
  }, [authLoading, isAuthenticated])

  if (isAuthenticated) {
    return <Redirect href="/" />
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#0F4539" />
    </View>
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
