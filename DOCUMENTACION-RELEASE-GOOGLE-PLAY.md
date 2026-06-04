# Documentación — Preparación Release Google Play (SportMatch)

**Fecha:** 2026-05-29  
**Objetivo:** Dejar la app lista para `eas build --platform android --profile production` y subida a Google Play Console con el menor riesgo posible.  
**Stack:** Expo SDK 54 · React Native · Expo Router · Supabase · EAS Build · Google OAuth · Push · Sentry

---

## Resumen ejecutivo

Se implementaron cambios en código y configuración para cumplir requisitos técnicos y de compliance de Google Play:

1. Limpieza de permisos Android innecesarios
2. Flujo de eliminación de cuenta in-app (doble confirmación)
3. Términos de Uso y Política de Privacidad (pantallas + links en login)
4. Estabilización del flujo OAuth Android (callback + hydrate)
5. Documentación de secrets EAS para production
6. Actualización de dependencias Expo (patch versions SDK 54)

**Estado:** el código compila y el manifest queda limpio tras prebuild. Antes de publicar hay pasos manuales externos (SQL Supabase, EAS Secrets, Google Cloud OAuth, Play Console).

---

## 1. Permisos Android

### Problema

El manifest generado incluía permisos no usados por la app (`RECORD_AUDIO`, `CAMERA`, storage legacy, `SYSTEM_ALERT_WINDOW`), con riesgo en revisión de Google Play y en el formulario Data Safety.

### Solución

**Archivo:** `app.json`

```json
"android": {
  "blockedPermissions": [
    "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.SYSTEM_ALERT_WINDOW"
  ]
}
```

**Plugin `expo-image-picker`:** se eliminó `cameraPermission`. Solo queda `photosPermission` porque la app usa únicamente `launchImageLibraryAsync` (galería), no cámara.

### Permisos que permanecen

| Permiso | Uso |
|---------|-----|
| `INTERNET` | Supabase, OAuth, API |
| `VIBRATE` | Notificaciones |

Los permisos bloqueados aparecen en el manifest mergeado con `tools:node="remove"`.

### Verificación local

```bash
npx expo prebuild --platform android --no-install --clean
grep uses-permission android/app/src/main/AndroidManifest.xml
```

Resultado esperado: solo `INTERNET` y `VIBRATE` activos; los bloqueados con `tools:node="remove"`.

---

## 2. Eliminación de cuenta (Google Play)

### Requisito

Google Play exige una vía clara dentro de la app para que el usuario elimine su cuenta y datos asociados.

### Backend — RPC Supabase

**Archivo:** `scripts/delete-own-account-rpc.sql`

Ejecutar **una vez** en Supabase Dashboard → SQL Editor.

La función `public.delete_own_account()`:

- Verifica `auth.uid()`
- Elimina tokens push (`mobile_push_subscriptions`, `push_subscriptions` si existen)
- Elimina equipos donde el usuario es capitán (evita `ON DELETE RESTRICT` en `teams.captain_id`)
- Elimina membresías, invitaciones y solicitudes de equipo
- Elimina `auth.users` → CASCADE a `profiles` y tablas con `ON DELETE CASCADE`

Retorna JSON: `{ "ok": true }` o `{ "ok": false, "error": "..." }`.

```sql
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
```

### Cliente

**Archivo:** `lib/supabase/delete-own-account.ts`

- Llama `supabase.rpc('delete_own_account')`
- Mensaje claro si la función no existe en el servidor

### Estado global

**Archivo:** `lib/app-provider.tsx`

Nueva función expuesta en contexto:

```typescript
deleteAccount: () => Promise<{ ok: boolean; error?: string }>
```

Flujo tras RPC exitoso:

1. `supabase.auth.signOut({ scope: 'local' })` (el usuario ya no existe en servidor)
2. Limpieza AsyncStorage (mismas keys que `logout`)
3. `setCurrentUser(null)` + `clearLists()`

### UI — Jugador

**Archivo:** `components/profile-screen.tsx`

Ruta: **Perfil → Configuración → Cuenta → Eliminar mi cuenta**

- Primera alerta: advertencia de irreversibilidad
- Segunda alerta: confirmación final
- Spinner mientras procesa
- Tras éxito: sesión cerrada y redirección al login (vía `currentUser === null` en gate)

Texto principal:

> Esta acción eliminará tu cuenta y datos asociados y no se puede deshacer.

### UI — Centro deportivo

**Archivo:** `components/venue-dashboard-screen.tsx`

Ruta: **Mi centro → pestaña Perfil → Eliminar mi cuenta**

Mismo patrón de doble confirmación adaptado a cuentas `venue`.

### Si falla la eliminación

Causa más común: no se ejecutó el SQL en Supabase. El usuario verá:

> La eliminación de cuenta no está activa en el servidor. Ejecuta scripts/delete-own-account-rpc.sql en Supabase.

---

## 3. Términos y Política de Privacidad

### Contenido legal

**Archivo:** `lib/legal-content.ts`

- `legalDocumentTitle(kind)` — títulos
- `legalDocumentSections(kind)` — secciones para `privacy` y `terms`
- Texto orientado a SportMatch (datos recolectados, uso, eliminación, contacto)

Actualizar en producción el email de contacto (`privacidad@sportmatch.cl`) si corresponde otro.

### Componente reutilizable

**Archivo:** `components/legal-document-screen.tsx`

- `LegalDocumentScreen` — ScrollView legible con tema claro/oscuro
- `legalScreenOptions(kind)` — título para header de Expo Router

### Rutas

| Ruta | Archivo | Título en header |
|------|---------|-------------------|
| `/privacy-policy` | `app/privacy-policy.tsx` | Política de Privacidad |
| `/terms` | `app/terms.tsx` | Términos de Uso |

Registradas en `app/_layout.tsx` en el Stack raíz.

### Login — aceptación legal

**Archivo:** `components/auth-screen.tsx`

Debajo del botón de email (crear cuenta / iniciar sesión):

> Al continuar aceptas nuestros **Términos de Uso** y **Política de Privacidad**.

Links navegables con `Link` de Expo Router.

### Perfil — acceso legal

En el modal **Configuración** del perfil hay links a las mismas rutas.

---

## 4. OAuth Android — estabilización

### Callback unificado

**Archivo:** `app/auth/callback.tsx`

**Antes:** tres mecanismos en paralelo (`subscribeOAuthCallbackUrls`, `recoverOAuthCallbackFromAllSources`, polling cada 1s × 20).

**Ahora:**

1. Un `useEffect` con ref anti-duplicado (`recoveryStartedRef`)
2. `recoverOAuthCallbackFromAllSources(params, linkingUrl)` al montar
3. `Linking.addEventListener('url')` solo para URLs tardías mientras la pantalla está abierta
4. Timeout de fallback a `/` reducido a **12 s** (antes 15 s)
5. Eliminado polling innecesario

Flujo esperado:

```text
signInWithOAuth
  → Custom Tabs / Google
  → Supabase /callback (servidor)
  → sportmatch://auth/callback?code=…
  → recoverOAuthCallbackFromAllSources
  → exchangeCodeForSession (PKCE)
  → syncAuthFromSession
  → Redirect /
```

### Hydrate de sesión sin email explícito

**Archivo:** `lib/app-provider.tsx` — función `hydrateFromSession`

**Antes:** si `session.user.email` estaba vacío, se hacía `setCurrentUser(null)` y se perdía la sesión en UI.

**Ahora:** fallback interno de email para hydrate:

```typescript
const email =
  emailRaw ||
  `${authUser.id.replace(/-/g, '').slice(0, 12)}@session.sportmatch`
```

La sesión auth en AsyncStorage se mantiene; el usuario no vuelve al login por un edge case de metadata OAuth.

### Configuración OAuth (sin cambios en código — recordatorio)

| Dónde | Valor |
|-------|--------|
| Scheme app | `sportmatch` |
| Redirect URI nativa | `sportmatch://auth/callback` |
| Supabase Redirect URLs | `sportmatch://auth/callback` |
| Google Cloud Android | Package `com.pichanga.expo` + SHA-1 keystore **EAS production** |

Checklist operativo: `OAUTH-ANDROID-RELEASE-CHECKLIST.md`

---

## 5. EAS Build y variables de entorno

### Documentación de secrets

**Archivo:** `EAS-PRODUCTION-SECRETS.md`

Lista variables obligatorias y opcionales para perfil `production` en expo.dev.

### `.env.example` ampliado

**Archivo:** `.env.example`

- Nota sobre `EXPO_PUBLIC_PRIVACY_POLICY_URL` para Play Console
- Referencia a secrets EAS vs `.env` local

### `eas.json` (sin cambio estructural)

- `production` → `buildType: "app-bundle"` ✅
- `appVersionSource: "remote"` — versionCode gestionado en Expo dashboard
- `SENTRY_DISABLE_AUTO_UPLOAD: true` en todos los perfiles (considerar quitar en production si quieres source maps automáticos)

### Comando de build production

```bash
npx eas-cli build --platform android --profile production
```

---

## 6. Dependencias actualizadas

Ejecutado `npx expo install` con patch versions compatibles SDK 54:

| Paquete | Versión anterior | Versión actual |
|---------|------------------|----------------|
| `expo` | 54.0.34 | ~54.0.35 |
| `expo-router` | 6.0.23 | ~6.0.24 |
| `expo-file-system` | 19.0.22 | ~19.0.23 |
| `expo-font` | 14.0.11 | ~14.0.12 |

Verificación: `npx tsc --noEmit` pasa sin errores.

---

## 7. Mapa de archivos

### Archivos nuevos

| Archivo | Propósito |
|---------|-----------|
| `scripts/delete-own-account-rpc.sql` | RPC Supabase eliminación de cuenta |
| `lib/supabase/delete-own-account.ts` | Cliente RPC |
| `lib/legal-content.ts` | Textos legales |
| `components/legal-document-screen.tsx` | UI pantallas legales |
| `app/privacy-policy.tsx` | Ruta privacidad |
| `app/terms.tsx` | Ruta términos |
| `EAS-PRODUCTION-SECRETS.md` | Guía secrets production |

### Archivos modificados

| Archivo | Cambio principal |
|---------|------------------|
| `app.json` | `blockedPermissions`, image-picker sin cámara |
| `app/_layout.tsx` | Stack screens legales |
| `app/auth/callback.tsx` | OAuth recovery unificado |
| `components/auth-screen.tsx` | Links legales en login |
| `components/profile-screen.tsx` | Eliminar cuenta + links legales |
| `components/venue-dashboard-screen.tsx` | Eliminar cuenta (venue) |
| `lib/app-provider.tsx` | `deleteAccount`, fix hydrate |
| `.env.example` | Notas production |
| `package.json` / `package-lock.json` | Patch deps Expo |

---

## 8. Checklist pre-publicación

### En el repo (hecho)

- [x] Permisos Android bloqueados en `app.json`
- [x] Flujo eliminar cuenta en UI (jugador + centro)
- [x] SQL RPC documentado
- [x] Términos y Privacidad in-app
- [x] Links legales en login
- [x] OAuth callback estabilizado
- [x] Deps Expo alineadas SDK 54
- [x] TypeScript compila

### Manual (pendiente antes de Play)

- [ ] Ejecutar `scripts/delete-own-account-rpc.sql` en Supabase
- [ ] Configurar EAS Secrets production (`EXPO_PUBLIC_SUPABASE_*`, etc.)
- [ ] SHA-1 keystore EAS en Google Cloud Console (cliente Android OAuth)
- [ ] Redirect URL `sportmatch://auth/callback` en Supabase Auth
- [ ] Probar OAuth en AAB production (dispositivo físico)
- [ ] Probar eliminar cuenta en AAB (cuenta de prueba)
- [ ] Play Console: Data Safety, content rating, Privacy Policy URL pública
- [ ] Feature graphic, screenshots, descripción store
- [ ] Incrementar `versionCode` en Expo (remote) antes de cada upload

---

## 9. Pruebas recomendadas

### Permisos

```bash
npx expo prebuild --platform android --no-install --clean
grep uses-permission android/app/src/main/AndroidManifest.xml
```

### OAuth (APK/AAB release)

1. Desinstalar builds anteriores
2. Instalar AAB/APK production o preview
3. Continuar con Google → debe loguear sin volver a login
4. Cerrar app y reabrir → sesión restaurada

Logs opcionales:

```bash
adb logcat | grep -E '\[OAuth\]|\[Exchange\]|\[AuthCallback\]|\[Hydrate\]'
```

Con `EXPO_PUBLIC_AUTH_DEBUG=1` en EAS env.

### Eliminar cuenta

1. Crear cuenta de prueba
2. Perfil → Configuración → Eliminar mi cuenta
3. Confirmar dos veces
4. Debe volver al login
5. Verificar en Supabase que `auth.users` ya no tiene ese id

### Legales

1. Desde login, pulsar Términos y Privacidad → deben abrir pantallas
2. Desde Perfil → Configuración → links legales

---

## 10. Estado final

### ⚠️ Lista pero requiere validaciones manuales externas antes de subir

La base técnica en el repositorio está preparada. La publicación depende de:

- SQL Supabase ejecutado
- Secrets EAS configurados
- OAuth Google/Supabase alineados con keystore production
- Assets y formularios de Play Console

---

## Referencias relacionadas

- `AUDITORIA-GOOGLE-PLAY-RELEASE.md` — auditoría previa al implementar cambios
- `OAUTH-ANDROID-RELEASE-CHECKLIST.md` — checklist OAuth Android
- `EAS-PRODUCTION-SECRETS.md` — variables EAS production
