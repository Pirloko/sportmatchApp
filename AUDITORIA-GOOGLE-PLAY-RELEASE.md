# Auditoría Google Play — SportMatch (Expo SDK 54)

**Fecha:** 2026-05-29  
**Alcance:** Revisión técnica de preparación para publicación en Google Play Store  
**Stack:** Expo · React Native · Expo Router · Supabase · EAS Build · Google OAuth · Deep Linking  

Revisión basada en el código real del repo: `app.json`, `app.config.ts`, `eas.json`, `package.json`, flujo auth/OAuth, deep linking, `lib/app-provider.tsx`, manifests generados con `expo prebuild`, plugins, push, Sentry y pantallas críticas.

---

## 1. BUILD & CONFIG AUDIT

| Ítem | Estado | Detalle |
|------|--------|---------|
| **Expo SDK** | ⚠️ | `expo ~54.0.34` — `expo-doctor` reporta patch desactualizado (`~54.0.35` esperado) |
| **React Native** | ✅ | `0.81.5` — alineado con SDK 54 |
| **React** | ✅ | `19.1.0` |
| **expo-router** | ⚠️ | `~6.0.23` (esperado `~6.0.24`) |
| **Compatibilidad general** | ⚠️ | 16/18 checks en `expo-doctor`; patch mismatches en 4 paquetes |
| **android.package** | ✅ | `com.pichanga.expo` — consistente en `app.json` y prebuild |
| **versionName** | ✅ | `1.0.0` |
| **versionCode** | ⚠️ | `1` en `app.json` + `eas.json` usa `"appVersionSource": "remote"` → el versionCode efectivo lo gestiona EAS remoto; hay que confirmar en expo.dev que esté incrementado antes de cada release |
| **minSdkVersion** | ✅ | **24** (default Expo SDK 54) |
| **targetSdkVersion** | ✅ | **35** — cumple requisito Google Play 2025 |
| **compileSdkVersion** | ✅ | **35** |
| **orientation** | ✅ | `portrait` + `screenOrientation="portrait"` en MainActivity |
| **icon** | ✅ | `1024×1024` PNG |
| **adaptiveIcon** | ✅ | `1024×1024`, fondo `#000000` |
| **splash** | ⚠️ | Existe `splash-icon.png` 1024×1024 sobre fondo blanco — funcional pero básico para store (no splash branded full-screen) |
| **scheme** | ✅ | `sportmatch` — coherente en OAuth, linking e intent filters |
| **intent filters** | ✅ | `sportmatch://auth/callback` declarado con `host=auth`, `pathPrefix=/callback` |
| **intent filter extra** | ⚠️ | También hay filtro genérico `sportmatch://` (sin host) — correcto para Expo Router, pero amplía superficie de deep links |
| **plugins** | ✅ | `expo-router`, `expo-notifications`, `expo-image-picker`, `expo-web-browser`, `expo-font`, `@sentry/react-native` |
| **updates / runtimeVersion** | ⚠️ | **No configurado** — manifest generado: `expo.modules.updates.ENABLED=false`. Sin OTA; cada fix requiere nuevo AAB |
| **newArchEnabled** | ✅ | `false` — coherente con retirada de `react-native-quick-crypto` |
| **EAS projectId** | ✅ | Presente en `extra.eas.projectId` |
| **Metro config** | ⚠️ | `expo-doctor` advierte custom `metro.config.js` que no extiende `expo/metro-config` (no encontrado en root; posible falso positivo o config heredada) |
| **Branding vs package** | ⚠️ | App: **SportMatch**, package: **com.pichanga.expo** — no bloquea Play, pero confunde QA y credenciales Google |

---

## 2. GOOGLE PLAY READINESS (permisos Android)

Manifest real generado por prebuild (`android/app/src/main/AndroidManifest.xml`):

| Permiso | Estado | Riesgo |
|---------|--------|--------|
| `INTERNET` | ✅ | Necesario |
| `VIBRATE` | ✅ | Notificaciones |
| `READ_EXTERNAL_STORAGE` | ⚠️ | Legacy; en API 33+ debería ser `READ_MEDIA_*`. Declarar mal en Data Safety puede generar fricción |
| `WRITE_EXTERNAL_STORAGE` | ⚠️ | Legacy, probablemente innecesario si solo usas galería moderna |
| `RECORD_AUDIO` | ❌ | **No hay uso de micrófono en el código.** Obliga a declararlo en Data Safety; riesgo alto de preguntas del reviewer |
| `SYSTEM_ALERT_WINDOW` | ⚠️ | Presente en **main** y debug — típico de dev; no debería ir a producción |
| `CAMERA` | ⚠️ | Plugin `expo-image-picker` declara `cameraPermission`, pero el código **solo usa `launchImageLibraryAsync`** — permiso de cámara innecesario |
| `POST_NOTIFICATIONS` | ⚠️ | **No aparece en manifest** — en Android 13+ la app pide permiso en runtime vía expo-notifications; verificar en dispositivo real |
| `ACCESS_FINE/COARSE_LOCATION` | ✅ | No declarados — correcto (solo ciudad manual, sin GPS) |
| Exact alarms / foreground services / background tasks | ✅ | No detectados |

**Permisos que podrían causar rechazo o retraso:** `RECORD_AUDIO` sin funcionalidad, `SYSTEM_ALERT_WINDOW` en release, permisos de almacenamiento legacy mal alineados con Data Safety.

---

## 3. SUPABASE AUTH AUDIT

### Configuración cliente (`lib/supabase/client.ts`)

| Setting | Valor | Evaluación |
|---------|-------|------------|
| `persistSession` | `true` | ✅ |
| `autoRefreshToken` | `true` | ✅ |
| `detectSessionInUrl` | `false` en nativo, `true` en web | ✅ Correcto para PKCE manual |
| `flowType` | `pkce` nativo / `implicit` web | ✅ |
| `storage` | AsyncStorage, key `pichanga-auth` | ✅ |
| Singleton `getSupabase()` | ✅ | Evita carreras PKCE |

### Email/password

| Aspecto | Estado |
|---------|--------|
| `signUp` / `signInWithPassword` | ✅ Implementados |
| Confirmación email | ⚠️ Si Supabase exige confirmación, signup devuelve error explícito — OK, pero hay que alinear dashboard |
| Género en registro | ❌ `AuthScreen` fija `gender = 'male'` siempre — bug de producto en signup email |
| Post-login hydrate | ✅ `resolveAppUserFromAuth` con fallback si no hay fila en `profiles` |

### Google OAuth

| Aspecto | Estado |
|---------|--------|
| `signInWithOAuth` | ✅ Con `redirectTo = getOAuthRedirectUri()` |
| `skipBrowserRedirect` | ✅ `false` en nativo (evita pantalla en blanco en Custom Tabs) |
| `exchangeCodeForSession` | ✅ En `complete-oauth-redirect.ts` con deduplicación |
| `WebBrowser.openAuthSessionAsync` + `Linking` fallback | ✅ Robusto para Android dismiss sin URL |
| Captura global de deep link | ✅ `startGlobalOAuthCallbackCapture()` |
| Ruta `/auth/callback` | ✅ **Sí canjea** vía `recoverOAuthCallbackFromAllSources` (docs internos antiguos están desactualizados) |
| `onAuthStateChange` | ✅ Maneja `SIGNED_IN`, `INITIAL_SESSION`, `TOKEN_REFRESHED`, `SIGNED_OUT` |
| `getSession` al arranque | ✅ |
| Logout | ✅ `signOut` + limpieza AsyncStorage de keys de navegación |
| Detección callback web erróneo | ✅ Detecta retorno a `sportmatch.cl` |

### Riesgos típicos Android release

| Escenario | Riesgo actual |
|-----------|---------------|
| Vuelve al login tras OAuth | ⚠️ **Medio** — código bien diseñado, pero depende 100% de config externa (Supabase Redirect URLs, SHA-1 EAS en Google Cloud) |
| No restaura sesión al abrir | ⚠️ **Bajo-medio** — hydrate al inicio OK; si `session.user.email` falta, se hace `setCurrentUser(null)` aunque haya sesión |
| Loading infinito en callback | ⚠️ Polling 20×1s + timeout 15s → redirect a `/` — UX degradada pero no infinita |
| Callback no manejado en cold start | ✅ Mitigado con captura global + `/auth/callback` |
| Selector Google no aparece | ⚠️ Depende de Custom Tabs + config Google Cloud; no verificable solo con código |
| OAuth concurrente | ✅ Lock en `oauth-session-lock.ts` |

### Dependencias externas no verificables en repo (críticas para OAuth en release)

- Supabase Redirect URLs: `sportmatch://auth/callback`
- Google Cloud: SHA-1 del **keystore EAS production** (no debug)
- Client IDs Web + Android en Supabase
- `EXPO_PUBLIC_SUPABASE_*` en **EAS Secrets** para perfil `production`

---

## 4. DEEP LINKING AUDIT

| Ítem | Estado |
|------|--------|
| Scheme | ✅ `sportmatch` |
| URI OAuth esperada | ✅ `sportmatch://auth/callback` (`lib/oauth-redirect.ts` + `lib/app-linking.ts`) |
| Expo Router ruta | ✅ `app/auth/callback.tsx` |
| Intent filter Android | ✅ Alineado con host `auth` + path `/callback` |
| `makeRedirectUri({ scheme, path: 'auth/callback' })` | ✅ |
| Invitaciones equipo | ✅ Usa `EXPO_PUBLIC_SITE_URL` o fallback `sportmatch://equipo/{id}` — esquema unificado (ya no `pichanga://`) |
| `autoVerify: false` | ⚠️ OK para custom scheme; App Links HTTPS no configurados |
| Mismatch Supabase | ⚠️ Solo verificable en dashboard — checklist interno (`OAUTH-ANDROID-RELEASE-CHECKLIST.md`) está bien documentado |

**Problema menor:** dos `useEffect` en `callback.tsx` ejecutan recovery en paralelo (subscribe + recover). Hay guards idempotentes, pero puede generar logs confusos y trabajo duplicado.

---

## 5. ANDROID RELEASE BUILD AUDIT

| Ítem | Estado |
|------|--------|
| `eas build --platform android --profile production` | ✅ Configurado con `buildType: "app-bundle"` |
| Signing / keystore | ⚠️ Gestionado por EAS (no visible en repo — normal). Confirmar credenciales en expo.dev |
| Perfil `preview` → APK | ✅ Para QA interno |
| Variables env en `eas.json` production | ❌ **Solo** `SENTRY_DISABLE_AUTO_UPLOAD=true` — faltan `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, opcionales Sentry/site URL **deben estar en EAS Secrets** |
| `.env` en repo | ✅ Gitignored — correcto |
| APKs en root del repo | ⚠️ `build-*.apk` untracked — no afectan Play pero ensucian repo |
| ProGuard/R8 minify | ⚠️ `enableMinifyInReleaseBuilds` default **false** — AAB más grande, menos riesgo R8 |
| Sentry source maps | ⚠️ `SENTRY_DISABLE_AUTO_UPLOAD=true` en **todos** los perfiles incluido production — crashes en Play serán difíciles de simbolizar |
| Hermes | ✅ Habilitado |
| Solo falla en release | ⚠️ OAuth PKCE + polyfill `crypto.subtle` — **solo se prueba bien en build nativo**, no en Expo Go Android para push |
| `android/` gitignored | ✅ Workflow managed + EAS prebuild en nube |

---

## 6. APP PERFORMANCE AUDIT

| Hallazgo | Severidad |
|----------|-----------|
| **`AppProvider` monolítico (~2600 líneas)** — todo el estado global en un contexto | ⚠️ Re-renders amplios en cualquier cambio de estado |
| **`fetchAndSetPlayerData` al login** — 7 queries paralelas incluyendo **todos** los partidos, equipos, desafíos | ⚠️ Cold start lento con datos reales |
| **`fetchMatchOpportunities`** — `select *` sin paginación ni filtros | ⚠️ No escala |
| Refetch completo tras cada mutación (join, create, etc.) | ⚠️ Fetch duplicado frecuente |
| React Query presente pero **poco usado** en flujos principales (solo explore hooks) | ⚠️ Oportunidad perdida |
| Chat realtime | ✅ Canal Supabase con `removeChannel` en cleanup |
| `auth/callback` polling 1s × 20 | ⚠️ Innecesario si exchange funciona |
| Logs auth en producción | ⚠️ Solo con `EXPO_PUBLIC_AUTH_DEBUG=1` — OK |
| Animaciones auth screen | ✅ Limpian loop en unmount |
| Stable array setters en AppProvider | ✅ Buena práctica anti re-render |

---

## 7. CRASH RISK AUDIT

| Riesgo | Estado |
|--------|--------|
| PKCE sin `crypto.subtle` | ✅ Mitigado con polyfill en `instrumentation.ts` |
| `getSupabase()` throw sin env | ⚠️ Pantalla de config en `/` si no hay env; otras rutas asumen config OK |
| Sesión null en navegación | ✅ Tabs redirigen a `/` si no hay `currentUser` |
| Race auth hydrate vs OAuth | ⚠️ Medio — múltiples paths de exchange; guards ayudan |
| Email ausente en Google OAuth | ⚠️ `hydrateFromSession` limpia usuario si no hay email |
| `ChatScreen` sin `opportunityId` | ✅ `canAccess` false — no crash, UX vacía |
| AsyncStorage corrupto | ⚠️ No hay recovery explícito |
| Push en Expo Go Android | ✅ Detectado y evitado |
| Null access en listas | ⚠️ Generalmente defensivo con `?.` y fallbacks |
| Sentry | ✅ Integrado; deshabilitado sin DSN |

---

## 8. STORE SUBMISSION CHECKLIST

| Requisito | ¿Listo? |
|-----------|---------|
| **Generar AAB production** | ⚠️ Técnicamente sí con EAS; falta validar secrets y credenciales |
| **Icono launcher** | ✅ 1024px |
| **Adaptive icon** | ✅ |
| **Splash** | ⚠️ Básico |
| **Feature graphic (1024×500)** | ❌ No en repo |
| **Screenshots** | ❌ No en repo (Play Console) |
| **Privacy Policy URL** | ❌ **No hay enlace en app ni URL documentada en repo** |
| **Terms of Service** | ❌ No visible en login/registro |
| **Data Safety form** | ❌ Pendiente manual — app recolecta: email, teléfono WhatsApp, fotos, mensajes, analytics, push token |
| **Account deletion in-app** | ❌ **No implementado** — Google exige ruta clara para eliminar cuenta + datos si hay registro |
| **Login compliance** | ⚠️ Google OAuth + email; falta disclosure de datos y links legales en pantalla auth |
| **Target audience / content rating** | ❌ Pendiente cuestionario Play |
| **App signing by Google Play** | ⚠️ Configurar en primera subida |
| **FCM / push production** | ⚠️ Token Expo push OK; falta validar entrega real en release |
| **Descripción store** | ❌ Fuera del repo |

---

## 9. FINAL VERDICT

### Estado general:

## ⚠️ Casi lista pero faltan ajustes

La base técnica (Expo 54, targetSdk 35, AAB production, OAuth PKCE bien implementado, deep link alineado, Sentry, persistencia de sesión) es **sólida para un MVP**. **No está lista para publicar en Google Play hoy** por gaps de compliance, permisos sospechosos y dependencias operativas no verificables en el repo.

---

### Problemas críticos encontrados:

1. **Sin eliminación de cuenta in-app** — requisito Google Play para apps con registro de usuarios.
2. **Sin Privacy Policy / Terms enlazados** en la app ni evidencia de URL pública lista para Play Console.
3. **`RECORD_AUDIO` en manifest sin funcionalidad de micrófono** — riesgo en revisión y Data Safety.
4. **Variables de entorno de producción no declaradas en `eas.json`** — dependencia total de EAS Secrets; un build sin secrets = app rota en producción.
5. **OAuth Google en release depende de config externa** (SHA-1 EAS, Redirect URLs Supabase) — no verificable aquí; es la causa #1 histórica de fallos según auditorías internas del proyecto.
6. **Permisos legacy de almacenamiento + cámara declarada pero no usada** — fricción en Data Safety y posibles preguntas del reviewer.

---

### Problemas recomendados:

1. Actualizar paquetes Expo (`npx expo install --check`) — patch mismatches detectados por `expo-doctor`.
2. Eliminar o bloquear permisos no usados vía `android.blockedPermissions` en `app.json` (`RECORD_AUDIO`, `CAMERA`, `SYSTEM_ALERT_WINDOW`, storage legacy si aplica).
3. Configurar **Sentry source maps en production** (quitar `SENTRY_DISABLE_AUTO_UPLOAD` o subir maps manualmente).
4. Añadir `POST_NOTIFICATIONS` explícito si falta tras revisar manifest de release mergeado.
5. Documentar y verificar **EAS Secrets**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SITE_URL`.
6. Probar OAuth end-to-end en **AAB production** (no solo APK preview) con SHA-1 de keystore production.
7. Corregir **género hardcodeado `'male'`** en registro email (`auth-screen.tsx`).
8. Añadir links legales en pantalla de login (privacidad + términos).
9. Definir estrategia de **versionCode** con `appVersionSource: remote` antes del primer upload.
10. Reducir carga inicial post-login (paginación / React Query en datos de jugador).

---

### Cosas opcionales para mejorar:

1. Configurar **EAS Update** + `runtimeVersion` para hotfixes JS sin resubir AAB.
2. Splash screen branded (no solo icono centrado).
3. Renombrar package de `com.pichanga.expo` a algo alineado con SportMatch (requiere nueva app en Play si ya publicaste).
4. Refactorizar `AppProvider` en dominios más pequeños.
5. App Links HTTPS verificados (`autoVerify: true`) además del custom scheme.
6. Almacenamiento seguro de tokens (SecureStore) vs AsyncStorage.
7. Quitar APKs del working tree / añadir a `.gitignore`.
8. Minificación R8 cuando la app esté estable.
9. Tests E2E de OAuth en dispositivo físico automatizados.

---

## Resumen técnico OAuth / Deep Link

El flujo actual está **bien implementado en código** para Android release:

```text
signInWithOAuth → Custom Tabs → Google → Supabase /callback
→ sportmatch://auth/callback?code=…
→ recoverOAuthCallbackFromAllSources / completeOAuthFromRedirectUrl
→ exchangeCodeForSession → AsyncStorage → hydrateFromSession → UI
```

Lo que **no se puede certificar desde el repo** y debe validarse antes de subir:

- Redirect URL `sportmatch://auth/callback` en Supabase Dashboard
- SHA-1 del keystore **production** en Google Cloud Console
- Client ID Android + Web en Supabase Auth
- Login Google completo en AAB firmado con credenciales EAS production

Checklist operativo ya documentado en el repo: `OAUTH-ANDROID-RELEASE-CHECKLIST.md`.

---

## Referencias internas del proyecto

- `OAUTH-ANDROID-RELEASE-CHECKLIST.md` — checklist post-implementación OAuth Android
- `AUDITORIA-OAUTH-ANDROID-FASE-ACTUAL.md` — diagnóstico OAuth (nota: algunos puntos sobre `/auth/callback` están desactualizados; el código actual sí canjea PKCE)
- `AUDITORIA-RELEASE-MOVIL-SPORTMATCH.md` — auditoría previa de release móvil
