/**
 * Debe importarse antes que el resto de la app (p. ej. al inicio de `app/_layout.tsx`).
 * Inicializa Sentry solo si existe `EXPO_PUBLIC_SENTRY_DSN`.
 */
import * as Sentry from '@sentry/react-native'

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  debug: __DEV__,
  environment: __DEV__ ? 'development' : 'production',
  enableAutoSessionTracking: true,
  tracesSampleRate: __DEV__ ? 1.0 : 0.15,
})

export { Sentry }
