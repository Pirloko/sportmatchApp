# EAS Build — variables para Google Play (production)

Configura estos secretos en [expo.dev](https://expo.dev) → proyecto **sportmatch** → **Environment variables** (perfil `production`).

## Obligatorias

| Variable | Descripción |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key del proyecto Supabase |

## Recomendadas

| Variable | Descripción |
|----------|-------------|
| `EXPO_PUBLIC_SITE_URL` | `https://www.sportmatch.cl` — invitaciones HTTPS |
| `EXPO_PUBLIC_SENTRY_DSN` | DSN de Sentry para crashes en producción |

## Solo en EAS (no en `.env` del repo)

| Variable | Descripción |
|----------|-------------|
| `SENTRY_AUTH_TOKEN` | Subida de source maps (quitar `SENTRY_DISABLE_AUTO_UPLOAD` en production si quieres maps automáticos) |
| `SENTRY_ORG` | Organización Sentry (opcional, plugin Expo) |
| `SENTRY_PROJECT` | `sportmatch` |

## Supabase (SQL, una vez)

Ejecutar en SQL Editor:

- `scripts/delete-own-account-rpc.sql` — eliminación de cuenta in-app (Google Play)

## Build production

```bash
npx eas-cli build --platform android --profile production
```

`eas.json` usa `appVersionSource: remote` — incrementa `versionCode` en Expo antes de cada subida a Play.
