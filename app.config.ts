import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Extiende la config estática de `app.json`.
 * Sentry: si existen `SENTRY_ORG` y `SENTRY_PROJECT`, se usa el plugin Expo con org/proyecto
 * (útil para source maps en EAS). Si no, se mantiene el plugin por defecto.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = (config.plugins ?? []).filter((p) => {
    if (p === '@sentry/react-native') return false
    if (Array.isArray(p) && p[0] === '@sentry/react-native') return false
    if (Array.isArray(p) && p[0] === '@sentry/react-native/expo') return false
    return true
  })

  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT ?? 'sportmatch'

  if (org) {
    plugins.push([
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        organization: org,
        project,
      },
    ])
  } else {
    plugins.push('@sentry/react-native')
  }

  return {
    ...config,
    name: config.name ?? 'SportMatch',
    slug: config.slug ?? 'sportmatch',
    plugins,
  }
}
