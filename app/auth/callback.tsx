import { Redirect } from 'expo-router'

/**
 * Captura el deep link de OAuth (p. ej. sportmatch://auth/callback) tras Google/Supabase.
 * Sin esta pantalla, Expo Router mostraba «Unmatched Route». El intercambio de tokens
 * lo resuelve WebBrowser.openAuthSessionAsync en app-provider; aquí solo volvemos al gate raíz.
 */
export default function AuthCallbackScreen() {
  return <Redirect href="/" />
}
