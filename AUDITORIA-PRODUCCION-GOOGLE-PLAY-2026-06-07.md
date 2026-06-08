# Auditoría completa — SportMatch móvil · Preparación Google Play

**Fecha de auditoría:** 7 de junio de 2026  
**Alcance:** Revisión exhaustiva del proyecto `COPIAconExpo` para validar si está listo para generar build de producción (AAB) y subir a Google Play Console.  
**Metodología:** Análisis estático del código, configuración Expo/EAS, prebuild Android, herramientas de validación (`tsc`, `expo-doctor`, `npm audit`), verificación de URLs legales públicas y revisión de documentación interna existente.  
**Restricción:** Solo revisión — no se modificó ningún archivo del proyecto.

---

## Veredicto ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Está lista para `eas build --platform android --profile production`? | **Condicionalmente sí** — el perfil EAS y la base técnica existen, pero hay un bloqueante de assets (icono no cuadrado) y cambios sin commitear que afectan funcionalidades recientes. |
| ¿Está lista para subir a Google Play (Production)? | **No todavía** — faltan pasos manuales externos obligatorios (secrets EAS, OAuth SHA-1, migraciones SQL, FCM, pruebas en dispositivo real, ficha de tienda, Data Safety). |
| ¿Recomendación inmediata? | Corregir icono → commitear cambios MVP → ejecutar SQL pendiente → build production → **Internal testing** en Play → smoke test completo → recién entonces Production. |

**Semáforo global:** 🟡 **Amarillo — casi lista, con bloqueantes menores en repo y bloqueantes operativos fuera del repo**

---

## 1. Stack tecnológico verificado

| Componente | Versión detectada | Estado |
|------------|-------------------|--------|
| Expo SDK | `~54.0.35` | ✅ Alineado con SDK 54 |
| React Native | `0.81.5` | ✅ Compatible SDK 54 |
| React | `19.1.0` | ✅ |
| expo-router | `~6.0.24` | ✅ |
| TypeScript | `~5.9.2`, `strict: true` | ✅ |
| Supabase JS | `^2.100.1` | ✅ |
| Sentry RN | `~7.2.0` | ✅ Integrado |
| TanStack Query | `^5.100.5` | ✅ |
| Hermes | Habilitado (default Expo) | ✅ |
| New Architecture | `newArchEnabled: false` | ✅ Coherente con retirada de `react-native-quick-crypto` |

**Validaciones ejecutadas:**

```bash
npx tsc --noEmit          → ✅ Sin errores
npx expo-doctor           → ⚠️ 17/18 checks OK (1 fallo: icono)
npx expo prebuild --platform android --no-install --clean → ✅ Genera proyecto nativo
```

---

## 2. Configuración de build (Expo / EAS)

### 2.1 Identidad de la app

| Campo | Valor | Evaluación |
|-------|-------|------------|
| Nombre visible | `SportMatch` | ✅ |
| Slug EAS | `sportmatch` | ✅ |
| Package Android | `com.pichanga.expo` | ⚠️ Nombre legacy; no bloquea Play pero confunde QA y credenciales Google |
| Bundle iOS | `com.pichanga.expo` | ⚠️ Misma observación |
| Scheme deep link | `sportmatch` | ✅ Unificado en OAuth, invitaciones y intent filters |
| versionName | `1.0.0` | ✅ Primera release |
| versionCode (local) | `1` | ⚠️ `eas.json` usa `"appVersionSource": "remote"` — el versionCode efectivo lo gestiona Expo dashboard; debe incrementarse antes de cada upload |
| EAS projectId | `300ae0e4-3792-4c58-b395-1cafefeb2322` | ✅ Presente en `app.json` |
| Owner Expo | `pirloko21` | ✅ |

### 2.2 Perfiles EAS (`eas.json`)

| Perfil | buildType | Uso | Estado |
|--------|-----------|-----|--------|
| `development` | APK | Dev client | ✅ |
| `preview` | APK | QA interna | ✅ |
| `production` | **app-bundle (AAB)** | Google Play | ✅ Correcto para Play Store |
| `submit.production` | — | Submit automático | ⚠️ Configurado vacío; requiere service account de Play si se usa |

### 2.3 Observaciones de build

- **OTA / EAS Update:** No configurado (`expo.modules.updates.ENABLED=false`). Cada corrección requiere nuevo AAB. Aceptable para MVP, pero planificar estrategia post-lanzamiento.
- **Sentry source maps:** `SENTRY_DISABLE_AUTO_UPLOAD: true` en **todos** los perfiles incluido production. Los crashes en Sentry serán menos legibles sin source maps.
- **Minificación R8:** Deshabilitada por defecto (`enableMinifyInReleaseBuilds = false`). APK/AAB más grande; aceptable para v1.
- **targetSdk / compileSdk:** `expo-doctor` pasa el check *"meets version requirements for submission to app stores"* → cumple requisito Google Play 2025/2026 (targetSdk 35 vía Expo SDK 54).

---

## 3. Assets e iconografía — ⚠️ BLOQUEANTE MENOR

### 3.1 Problema detectado

`app.json` referencia `./assets/sportmatch-logo.png` como:
- `icon`
- `splash.image`
- `android.adaptiveIcon.foregroundImage`
- Icono de notificaciones push

**Dimensiones reales:** `1181 × 1653` (rectangular, no cuadrado).

`expo-doctor` falla con:
> *image should be square, but the file at './assets/sportmatch-logo.png' has dimensions 1181x1653*

### 3.2 Assets disponibles alternativos

| Archivo | Dimensiones | Uso recomendado |
|---------|-------------|-----------------|
| `assets/icon.png` | 1024×1024 | ✅ Cuadrado — candidato ideal para `icon` y `adaptiveIcon` |
| `assets/adaptive-icon.png` | 1024×1024 | ✅ Cuadrado |
| `assets/splash-icon.png` | 1024×1024 | ✅ Cuadrado |
| `assets/sportmatch-logo.png` | 1181×1653 | ❌ No válido como icon/adaptiveIcon según schema Expo |

### 3.3 Impacto

- El build EAS **puede completarse** (Expo a veces no bloquea en cloud), pero el icono en launcher y Play puede verse recortado o distorsionado.
- Google Play exige icono 512×512 para store listing — hay que exportarlo desde un asset cuadrado.

### 3.4 Assets de tienda (fuera del repo — pendiente manual)

| Asset Play Console | Requisito | Estado |
|--------------------|-----------|--------|
| Icono tienda | 512×512 PNG | ⬜ Exportar desde `icon.png` |
| Feature graphic | 1024×500 JPG/PNG | ⬜ No existe en repo |
| Screenshots teléfono | Mín. 2, recomendado 4–8 | ⬜ Pendiente capturas |
| Descripción corta | Máx. 80 caracteres | ⬜ Pendiente |
| Descripción completa | — | ⬜ Pendiente |

---

## 4. Permisos Android — ✅ BIEN CONFIGURADO

### 4.1 Manifest generado (prebuild verificado)

Permisos **activos** en release:

| Permiso | Justificación |
|---------|---------------|
| `INTERNET` | Supabase, OAuth, push, API |
| `VIBRATE` | Notificaciones |

Permisos **bloqueados** con `tools:node="remove"` en `app.json`:

| Permiso bloqueado | Motivo |
|-------------------|--------|
| `RECORD_AUDIO` | App no usa micrófono |
| `CAMERA` | Solo galería (`launchImageLibraryAsync`), no cámara |
| `READ_EXTERNAL_STORAGE` | Legacy innecesario |
| `WRITE_EXTERNAL_STORAGE` | Legacy innecesario |
| `SYSTEM_ALERT_WINDOW` | Solo dev, no producción |

**Verificación código:** No hay uso de `launchCameraAsync`, `RECORD_AUDIO` ni `Camera` en el codebase.

### 4.2 Observación: POST_NOTIFICATIONS

El manifest generado **no incluye** `android.permission.POST_NOTIFICATIONS`. En Android 13+ (API 33+), este permiso es necesario para mostrar notificaciones.

- `expo-notifications` lo solicita en **runtime** vía `requestPermissionsAsync()` en `lib/push/register-device.ts`.
- Expo SDK 54 puede mergearlo en builds EAS cloud aunque no aparezca en prebuild local.
- **Acción requerida:** Verificar en dispositivo físico Android 13+ que el diálogo de permiso aparece y las push funcionan.

### 4.3 Ubicación GPS

No se declaran `ACCESS_FINE_LOCATION` ni `ACCESS_COARSE_LOCATION`. La app usa ciudad manual — coherente con Data Safety.

### 4.4 expo-image-picker

Plugin configurado solo con `photosPermission` (sin `cameraPermission`). Texto en español presente. ✅

---

## 5. Autenticación y OAuth — ✅ IMPLEMENTADO (requiere config externa)

### 5.1 Flujo técnico verificado

| Componente | Archivo | Estado |
|------------|---------|--------|
| Singleton Supabase | `lib/supabase/client.ts` | ✅ |
| PKCE S256 polyfill | `lib/supabase/polyfills.ts` + `instrumentation.ts` | ✅ |
| flowType nativo | `pkce` | ✅ |
| flowType web | `implicit` | ✅ |
| OAuth callback | `app/auth/callback.tsx` | ✅ Unificado, anti-duplicado |
| Redirect URI | `sportmatch://auth/callback` via `lib/app-linking.ts` | ✅ |
| Intent filter Android | `host=auth`, `pathPrefix=/callback` | ✅ |
| Persistencia sesión | AsyncStorage, `autoRefreshToken: true` | ✅ |
| Hydrate sin email | Fallback en `lib/app-provider.tsx` | ✅ |
| Logout + limpieza | AsyncStorage keys | ✅ |
| Debug OAuth | Solo `__DEV__` o `EXPO_PUBLIC_AUTH_DEBUG=1` | ✅ No activo en release por defecto |

### 5.2 Configuración externa pendiente (CRÍTICO para OAuth en AAB)

| Paso | Estado | Dónde |
|------|--------|-------|
| Redirect URL en Supabase | ⬜ Verificar | `sportmatch://auth/callback` |
| Google Client ID Web + Android en Supabase | ⬜ Verificar | Authentication → Google |
| SHA-1 keystore **EAS production** en Google Cloud | ⬜ Pendiente | `npx eas-cli credentials -p android` |
| OAuth consent screen publicado o en prueba | ⬜ Verificar | Google Cloud Console |

**Sin SHA-1 de producción correcto, Google OAuth fallará en el AAB de Play.**

### 5.3 Sign in with Apple

No implementado. **No bloquea Google Play** (solo iOS/App Store si hay login social de terceros). Documentado en `FASE6-RELEASE-READivity.md`.

### 5.4 Bug de producto detectado

En `components/auth-screen.tsx`, el registro por email fija género:

```typescript
const [gender] = useState<Gender>('male')
```

Todos los usuarios que se registren por email quedan como `male`. No bloquea Play, pero es un defecto funcional que conviene corregir antes o poco después del lanzamiento.

---

## 6. Compliance Google Play — ✅ CÓDIGO / ⚠️ CONSOLA PENDIENTE

### 6.1 Eliminación de cuenta — ✅

| Capa | Estado | Evidencia |
|------|--------|-----------|
| RPC Supabase | ✅ Documentado | `scripts/delete-own-account-rpc.sql` |
| Cliente | ✅ | `lib/supabase/delete-own-account.ts` |
| AppProvider | ✅ | `deleteAccount()` en `lib/app-provider.tsx` |
| UI jugador | ✅ | Perfil → Configuración → Eliminar mi cuenta (doble confirmación) |
| UI centro | ✅ | `venue-dashboard-screen.tsx` (ver nota abajo) |
| Texto legal | ✅ | `lib/legal-content.ts`, `POLITICA-DE-PRIVACIDAD.md` |

**Nota:** La app móvil nativa restringe cuentas `venue` y `admin` (`lib/mobile-app-access.ts`). Los centros ven pantalla de acceso restringido en Android/iOS. El texto legal menciona eliminación desde "Mi centro" en móvil, pero en la práctica solo jugadores usan la app nativa. No es bloqueante de Play si se declara correctamente en Data Safety y se ofrece eliminación vía web/correo para otros tipos de cuenta.

**SQL:** La guía indica que `delete_own_account` ya fue ejecutado en Supabase. Verificar con:

```sql
SELECT proname FROM pg_proc WHERE proname = 'delete_own_account';
```

### 6.2 Política de privacidad y términos — ✅

| Canal | URL / Ruta | Estado verificado |
|-------|------------|-------------------|
| Web privacidad | https://www.sportmatch.cl/privacidad | ✅ Accesible HTTPS, contenido completo |
| Web términos | https://www.sportmatch.cl/terminos | ✅ Accesible HTTPS, contenido completo |
| In-app privacidad | `/privacy-policy` | ✅ Ruta registrada en `_layout.tsx` |
| In-app términos | `/terms` | ✅ |
| Links en login | `components/auth-screen.tsx` | ✅ Links navegables |
| Links en perfil | `components/profile-screen.tsx` | ✅ |

### 6.3 Data Safety (Play Console — manual)

Declarar honestamente según la app real:

| Dato | ¿Recolecta? | Notas |
|------|-------------|-------|
| Email | Sí | Cuenta |
| Nombre, foto perfil | Sí | Perfil |
| Mensajes de chat | Sí | Partidos |
| Identificadores (user id, push token) | Sí | Cuenta / notificaciones |
| Ubicación GPS | **No** | Solo ciudad manual |
| Audio / micrófono | **No** | Bloqueado en manifest |
| Cámara | **No** | Bloqueado; solo galería |

Proveedores a declarar: Supabase, Google (login), Expo Push, Sentry (si DSN activo).

### 6.4 Otras declaraciones Play Console (manual)

| Sección | Estado |
|---------|--------|
| Content rating (IARC) | ⬜ Pendiente cuestionario |
| Target audience / edad | ⬜ Pendiente |
| Ads (¿contiene anuncios?) | ⬜ No hay ads en código → declarar "No" |
| App access (cuenta prueba para revisores) | ⬜ Pendiente — login obligatorio |
| Account deletion URL/instructions | ⬜ Completar en Play Console |
| Play App Signing | ⬜ Primera subida — recomendar que Google gestione la clave |

---

## 7. Backend / Supabase — Migraciones SQL

### 7.1 SQL documentados y estado

| Script | Propósito | Estado en repo | Ejecutar antes de prod |
|--------|-----------|----------------|------------------------|
| `scripts/delete-own-account-rpc.sql` | Eliminación cuenta | ✅ | ⚠️ Verificar en Supabase (guía dice hecho) |
| `scripts/mobile-push-subscriptions-migration.sql` | Tabla tokens push móvil | ✅ | ⬜ **Requerido** si push activo |
| `scripts/player-mvp-stats-migration.sql` | MVP stats + trigger anti auto-voto | ✅ (sin commitear) | ⬜ **Requerido** para features MVP recientes |
| Migración reseñas unificadas (web) | `venue_rating`, `mvp_user_id`, etc. | Documentado en MVP doc | ⬜ Verificar aplicada en Supabase |

### 7.2 Cron push (servidor)

`scripts/notifications-cron-dispatch.mjs` requiere:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (solo servidor/CI, nunca en app)
- Programación cada 5–15 min
- **FCM v1** configurado en EAS Credentials → Android

Sin cron + FCM, las push remotas no se entregarán aunque la app registre tokens.

---

## 8. Push notifications — ⚠️ IMPLEMENTADO, NO VALIDADO EN PROD

### 8.1 Cliente

| Funcionalidad | Archivo | Estado |
|---------------|---------|--------|
| Registro token Expo | `lib/push/register-device.ts` | ✅ |
| Tabla destino | `mobile_push_subscriptions` | ✅ (requiere SQL) |
| Canal Android default | `lib/push/bootstrap.tsx` | ✅ |
| Badge sincronizado | `setBadgeCountAsync(unreadCount)` | ✅ |
| Deep link desde push | `lib/notifications/resolve-route.ts` | ✅ |
| Handler foreground | `setNotificationHandler` | ✅ |
| Expo Go Android | Bloqueado explícitamente (SDK 53+) | ✅ Documentado |

### 8.2 Centro de notificaciones in-app (MVP reciente)

| Componente | Estado |
|------------|--------|
| `app/notificaciones.tsx` | ✅ |
| `components/notifications-screen.tsx` | ✅ |
| Badge en home | ✅ |
| Realtime Supabase | ✅ |

### 8.3 Pendiente operativo

- [ ] SQL `mobile_push_subscriptions` ejecutado
- [ ] FCM v1 en expo.dev → Credentials → Android
- [ ] Build en dispositivo físico (no Expo Go)
- [ ] Cron configurado en CI/servidor
- [ ] Smoke test: tap push → navega a ruta correcta

---

## 9. Funcionalidades MVP recientes (sin commitear) — ⚠️ RIESGO

### 9.1 Estado Git al momento de la auditoría

```
Modificados (11 archivos, +507 / -151 líneas):
  components/chat-screen.tsx
  components/match-completion-panel.tsx
  components/match-detail-screen.tsx
  components/profile-screen.tsx
  components/public-player-profile-modal.tsx
  lib/app-provider.tsx
  lib/supabase/public-player-profile.ts
  lib/supabase/rating-queries.ts
  lib/types.ts
  package.json / package-lock.json

Sin trackear (nuevos):
  DOCUMENTACION-MOVIL-NOTIFICACIONES-RESEÑAS-MVP.md
  components/profile-share-card.tsx
  lib/match-review-eligibility.ts
  lib/share-profile-instagram.ts
  lib/supabase/mvp-queries.ts
  scripts/player-mvp-stats-migration.sql
  build-*.apk (×4) ← NO deben subirse al repo
```

### 9.2 Impacto

Si se genera build de producción **ahora** sin commitear:
- Reseñas unificadas post-partido pueden estar rotas o en versión antigua
- Contador MVP en perfil no funcionará
- Compartir perfil en Instagram (`react-native-view-shot` + `expo-sharing`) no estará incluido
- Dependencia nueva `react-native-view-shot@4.0.3` no estará en el build si EAS toma commit anterior

**Recomendación:** Commitear y probar en preview/production antes de subir a Play.

### 9.3 APKs en raíz del proyecto

Hay 4 archivos `build-*.apk` sin trackear. Son artefactos de build local/EAS. Deben añadirse a `.gitignore` y no commitearse (aumentan repo, no aportan al source).

---

## 10. Deep linking — ✅ UNIFICADO

| Uso | Esquema | Archivo |
|-----|---------|---------|
| OAuth callback | `sportmatch://auth/callback` | `lib/app-linking.ts` |
| Invitación equipo (fallback) | `sportmatch://equipo/{id}` | `lib/team-invite-url.ts` |
| Invitación HTTPS (prod) | `{EXPO_PUBLIC_SITE_URL}/equipo/{id}` | Requiere env var |
| Intent filters Android | `sportmatch` + auth/callback | `app.json` |

**Corrección vs auditorías anteriores:** El esquema legacy `pichanga://` ya no se usa en código activo (solo mencionado en docs antiguos `BLOQUES.md`).

---

## 11. Seguridad

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| `.env` en `.gitignore` | ✅ | `.env`, `.env*.local` ignorados |
| Secrets en código | ✅ | No se encontraron API keys hardcodeadas |
| Variables públicas | ✅ | Solo `EXPO_PUBLIC_*` en cliente |
| Service role key | ✅ | Solo documentada para cron servidor |
| AsyncStorage para tokens | ⚠️ | Estándar RN; no es Keychain/Keystore |
| `allowBackup="true"` | ⚠️ | Permite backup Android de datos app; evaluar `false` si hay datos sensibles |
| npm audit (prod deps) | ⚠️ | Vulnerabilidades en transitivas de Expo toolchain (`@xmldom/xmldom`, `postcss`); no bloquean Play pero conviene `npm audit fix` cuando Expo lo permita |
| RLS Supabase | ⬜ | No verificable desde repo; asumir configurado en backend |

---

## 12. Observabilidad y estabilidad

| Componente | Estado |
|------------|--------|
| Sentry init | ✅ Condicional a `EXPO_PUBLIC_SENTRY_DSN` |
| Sentry wrap root | ✅ `Sentry.wrap(RootLayout)` |
| Product analytics | ✅ `lib/telemetry/product-analytics.ts` → Sentry breadcrumbs + Supabase `app_events` |
| Eventos push | ✅ `push_token_registered`, `push_opened`, etc. |
| ErrorBoundary React | ❌ No implementado |
| Tests automatizados | ❌ No hay suite de tests en el repo |
| Crash logs en DB | ✅ Fallback documentado en telemetría |

**Recomendación:** Configurar `EXPO_PUBLIC_SENTRY_DSN` en EAS production y considerar habilitar upload de source maps.

---

## 13. Arquitectura y calidad de código

### 13.1 Estructura

- **Expo Router** con tabs en `app/(tabs)/`
- Pantallas principales en `src/features/*/screens/` son **wrappers** que delegan a `components/*` (ej. `match-detail-screen.tsx`)
- **AppProvider monolítico** (`lib/app-provider.tsx`, ~2700+ líneas) — funcional pero con riesgo de performance en escalado
- **React Query** integrado via `AppQueryProvider`

### 13.2 Acceso por rol en móvil nativo

`lib/mobile-app-access.ts`: Solo cuentas **jugador** en iOS/Android. Admin y venue redirigidos a web. Coherente para app orientada a jugadores en Play.

### 13.3 Restricciones menores

- Duplicación conceptual `components/` vs `src/features/` — mantenible pero requiere disciplina
- Algunos `console.warn` en queries (notifications, mvp) — aceptable, no exponen datos sensibles
- Sin `TODO/FIXME` críticos en código TS/TSX

---

## 14. Variables de entorno requeridas

### 14.1 EAS Secrets — production (obligatorio)

| Variable | Obligatoria | Verificado en repo |
|----------|-------------|-------------------|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ Sí | `.env.example` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ Sí | `.env.example` |
| `EXPO_PUBLIC_SITE_URL` | Recomendada | `https://www.sportmatch.cl` |
| `EXPO_PUBLIC_SENTRY_DSN` | Recomendada | Opcional |
| `SENTRY_AUTH_TOKEN` | Opcional (source maps) | Solo EAS, no repo |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Opcional | `app.config.ts` |

**Estado:** No verificable desde repo si ya están en expo.dev — **acción manual requerida**.

Referencia: `EAS-PRODUCTION-SECRETS.md`

---

## 15. Checklist pre-build production

### En el repositorio

- [ ] **Corregir icono/adaptiveIcon** — usar `assets/icon.png` (1024×1024) en lugar de `sportmatch-logo.png` rectangular
- [ ] **Commitear** cambios MVP (reseñas, MVP stats, compartir perfil)
- [ ] **No commitear** APKs (`build-*.apk`)
- [ ] Verificar `npx tsc --noEmit` ✅ (pasa hoy)
- [ ] Verificar `npx expo-doctor` — debe pasar 18/18 tras fix de icono
- [ ] Confirmar que `package.json` incluye `react-native-view-shot` si se usa compartir perfil

### En Supabase

- [ ] `delete_own_account` RPC activa
- [ ] `mobile_push_subscriptions` tabla + RLS
- [ ] `player-mvp-stats-migration.sql` ejecutado
- [ ] Migración reseñas unificadas aplicada
- [ ] Redirect URLs: `sportmatch://auth/callback`

### En Google Cloud / EAS

- [ ] SHA-1 production en cliente OAuth Android
- [ ] Client IDs Web + Android en Supabase
- [ ] EAS Secrets production configurados
- [ ] FCM v1 credentials en Expo
- [ ] Incrementar `versionCode` remoto en expo.dev

### Comando build

```bash
npx eas-cli login
npx eas-cli build --platform android --profile production
```

---

## 16. Checklist pre-upload Google Play

### Pruebas en dispositivo real (AAB/APK production)

- [ ] App abre sin crash
- [ ] Login Google completa y persiste sesión
- [ ] Cerrar/reabrir app → sesión restaurada
- [ ] Login email (si aplica)
- [ ] Onboarding jugador
- [ ] Crear/unirse partido, chat, equipos
- [ ] Reseña post-partido con MVP (formato unificado)
- [ ] Notificaciones: permiso Android 13+ → token registrado → push recibida → tap navega
- [ ] Cambiar foto perfil (solo galería, sin pedir cámara/mic)
- [ ] Eliminar cuenta (cuenta prueba) → vuelve a login
- [ ] Términos y Privacidad desde login
- [ ] Compartir perfil / invitación equipo

### Play Console

- [ ] Crear app "SportMatch"
- [ ] Store listing completo (textos + assets)
- [ ] Privacy policy URL: `https://www.sportmatch.cl/privacidad`
- [ ] Data Safety completado
- [ ] Account deletion declarado
- [ ] Content rating
- [ ] App access: credenciales/instrucciones para revisores Google
- [ ] Subir AAB a **Internal testing** primero
- [ ] Smoke test desde enlace opt-in
- [ ] Promover a Production

---

## 17. Riesgos de rechazo Google Play (priorizados)

| # | Riesgo | Severidad | Mitigación |
|---|--------|-----------|------------|
| 1 | OAuth no funciona para revisores | 🔴 Alta | Cuenta prueba + SHA-1 correcto + instrucciones en App access |
| 2 | Data Safety inconsistente con permisos reales | 🔴 Alta | Declarar solo INTERNET, VIBRATE, galería; no mic/cámara/GPS |
| 3 | Sin eliminación de cuenta funcional | 🔴 Alta | Ya implementado — verificar RPC en Supabase |
| 4 | Privacy policy URL rota | 🟢 Baja | URL verificada ✅ |
| 5 | Icono distorsionado en tienda/dispositivo | 🟡 Media | Corregir asset cuadrado |
| 6 | Push no funcional (mala UX, no rechazo directo) | 🟡 Media | FCM + cron + prueba real |
| 7 | Features rotas por SQL no migrado (reseñas MVP) | 🟡 Media | Ejecutar SQL antes de release |
| 8 | Build sin últimos cambios (git dirty) | 🟡 Media | Commitear antes de EAS build |

---

## 18. Documentación interna revisada

| Archivo | Relevancia |
|---------|------------|
| `GUIA-PUBLICACION-GOOGLE-PLAY.md` | ✅ Guía operativa completa y actualizada |
| `DOCUMENTACION-RELEASE-GOOGLE-PLAY.md` | ✅ Cambios técnicos implementados (may 2026) |
| `EAS-PRODUCTION-SECRETS.md` | ✅ Variables EAS |
| `OAUTH-ANDROID-RELEASE-CHECKLIST.md` | ✅ Checklist OAuth detallado |
| `POLITICA-DE-PRIVACIDAD.md` / `TERMINOS-DE-USO.md` | ✅ Textos legales |
| `DOCUMENTACION-MOVIL-NOTIFICACIONES-RESEÑAS-MVP.md` | ✅ MVP jun 2026 (sin commitear) |
| `BLOQUE6_QA_RELEASE_CHECKLIST.md` | ⚠️ Checklist QA sin marcar — ningún ítem verificado como completado |
| `AUDITORIA-RELEASE-MOVIL-SPORTMATCH.md` | ⚠️ Parcialmente desactualizada (deep links ya corregidos) |
| `AUDITORIA-GOOGLE-PLAY-RELEASE.md` | ⚠️ Referencia mayo 2026; permisos ya corregidos |

---

## 19. Matriz resumen por área

| Área | Estado | Listo para prod |
|------|--------|-----------------|
| Config Expo/EAS | 🟡 | Casi — fix icono |
| TypeScript / deps | 🟢 | Sí |
| Permisos Android | 🟢 | Sí |
| OAuth (código) | 🟢 | Sí |
| OAuth (config externa) | 🔴 | No verificado |
| Legal / privacidad | 🟢 | Sí (web + in-app) |
| Eliminar cuenta | 🟢 | Sí (verificar SQL) |
| Push (código) | 🟢 | Sí |
| Push (infra) | 🔴 | FCM + cron pendiente |
| SQL backend MVP | 🔴 | Migraciones pendientes |
| Assets tienda | 🔴 | Pendiente manual |
| Play Console | 🔴 | Pendiente manual |
| Git / release hygiene | 🟡 | Commitear + quitar APKs |
| QA dispositivo real | 🔴 | No evidenciado |

---

## 20. Conclusión final

**SportMatch tiene una base técnica sólida y bien documentada para publicación en Google Play.** Los requisitos críticos de compliance (eliminación de cuenta, políticas legales, permisos Android limpios, OAuth PKCE, deep links unificados) están implementados en el código.

**No está lista para subir directamente a Production** por tres grupos de pendientes:

1. **En el repo (rápidos):** icono no cuadrado, cambios MVP sin commitear, APKs sueltos en raíz.
2. **Infraestructura (manuales):** EAS Secrets, SHA-1 OAuth, FCM v1, migraciones SQL, cron push, versionCode remoto.
3. **Play Console + QA (manuales):** store listing, Data Safety, content rating, pruebas E2E en AAB real.

### Secuencia recomendada (orden estricto)

1. Corregir `icon` / `adaptiveIcon` en `app.json` → usar `assets/icon.png`
2. Commitear trabajo MVP + añadir `build-*.apk` a `.gitignore`
3. Ejecutar SQL pendiente en Supabase (`mobile_push_subscriptions`, `player-mvp-stats-migration`)
4. Configurar EAS Secrets + Google OAuth SHA-1 + FCM
5. `eas build --platform android --profile production`
6. Probar AAB en dispositivo físico (checklist sección 16)
7. Completar Play Console → Internal testing → validar → Production

**Tiempo estimado para cerrar pendientes:** 1–2 días de trabajo operativo (excluyendo tiempo de revisión Google).

---

*Auditoría generada el 7 de junio de 2026. Solo revisión — ningún archivo del proyecto fue modificado.*
