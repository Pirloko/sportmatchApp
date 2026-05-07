# Fase 1 — Observabilidad y telemetría (completada)

Fecha: 2026-05-07  
Rama: `feature-carlos`

## Objetivo

Observabilidad mínima profesional: **Sentry** (opcional por DSN) + eventos de producto en **Supabase** (`app_events` / fallback) sin acoplar la UI y sin romper auth/navegación.

## Implementación

### Sentry (`@sentry/react-native`)

- **`instrumentation.ts`**: `Sentry.init` solo si existe `EXPO_PUBLIC_SENTRY_DSN` (`enabled: false` sin DSN).
- **`app/_layout.tsx`**: import de `instrumentation` primero; `export default Sentry.wrap(RootLayout)`.
- **`app.config.ts`**: extiende la config de Expo; plugin Sentry:
  - con `SENTRY_ORG` + `SENTRY_PROJECT` → `@sentry/react-native/expo` (source maps en EAS),
  - si no → plugin por defecto `@sentry/react-native`.

### Capa reutilizable

- **`lib/telemetry/product-analytics.ts`**:
  - `trackProductEvent` → breadcrumb Sentry + `trackEvent` Supabase.
  - `setAnalyticsUser` / `setUser(null)` en login/logout/hidratar sesión.
  - `captureProductException` en errores globales JS.

### Eventos instrumentados (nombres canónicos)

| Evento | Origen |
|--------|--------|
| `app_started` | `TelemetryBootstrap` |
| `screen_view` | `TelemetryBootstrap` (cambio de ruta) |
| `login_success` | email/Google, tras perfil OK |
| `login_failed` | email/Google, fallos y excepciones |
| `signup_success` | registro exitoso (flag `is_signup`) |
| `match_create_success` | `addMatchOpportunity`, `createTeamPickMatchOpportunity`, `createRivalChallenge` |
| `match_join_success` | `joinMatchOpportunity`, aceptar invitación |
| `chat_message_sent` | `chat-screen` tras insert OK |
| `booking_success` | reserva en crear partido, team pick con cancha, `reserveVenueOnly` |
| `push_received` | notificación en foreground (`addNotificationReceivedListener`) |
| `push_opened` | tap en notificación (`addNotificationResponseReceivedListener`) |
| `push_token_registered` / `push_token_failed` | `PushBootstrap` |

### Errores JS globales

- `TelemetryBootstrap`: `Sentry.captureException` + `trackCrash` Supabase (comportamiento previo conservado).

## Variables de entorno

Ver `.env.example`: `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

Para EAS: `SENTRY_AUTH_TOKEN` como secret (no commitear).

## Verificación

- `npx tsc --noEmit` — OK  
- `npx expo-doctor` — 17/17  

## Archivos tocados (principal)

- `instrumentation.ts`, `app.config.ts`, `app.json`, `app/_layout.tsx`
- `lib/telemetry/product-analytics.ts`, `lib/telemetry/bootstrap.tsx`
- `lib/push/bootstrap.tsx`
- `lib/app-provider.tsx`
- `components/chat-screen.tsx`
- `package.json` / `package-lock.json`
- `.env.example`, este documento

## Rollback

```bash
git revert <commit-fase-1>
```

Quitar `EXPO_PUBLIC_SENTRY_DSN` desactiva Sentry sin revertir código.

## Pruebas manuales sugeridas

1. Sin DSN: app arranca, eventos siguen yendo a Supabase si está configurado.  
2. Con DSN: ver evento/error de prueba en Sentry (dev).  
3. Login ok/ko: filas en `app_events` con `login_success` / `login_failed`.  
4. Crear partido / unirse / chat / push: eventos esperados.  

## Siguiente fase

**Fase 2 — App Provider y rerenders** (`mejoras.md`), cuando indiques.
