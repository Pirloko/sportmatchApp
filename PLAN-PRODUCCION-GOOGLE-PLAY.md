# Plan paso a paso — Build de producción Google Play (SportMatch móvil)

**Fecha:** 7 de junio de 2026  
**Objetivo:** Dejar la app móvil óptima y generar un AAB de producción listo para Internal Testing en Google Play.  
**Estado inicial confirmado:** Todos los SQL de Supabase ya ejecutados (`delete_own_account`, `mobile_push_subscriptions`, reseñas unificadas, `player-mvp-stats-migration`).  
**Referencia:** `AUDITORIA-PRODUCCION-GOOGLE-PLAY-2026-06-07.md`

---

## Resumen del plan (7 fases)

| Fase | Qué haces | Tiempo est. | Bloqueante |
|------|-----------|-------------|------------|
| **0** | Preparar repo (icono, git, hygiene) | 30–60 min | Sí |
| **1** | Validación local pre-build | 15 min | Sí |
| **2** | Configurar EAS + Supabase + Google OAuth | 45–90 min | Sí |
| **3** | Push: FCM + cron (opcional para v1, recomendado) | 30–60 min | Parcial |
| **4** | Build preview → QA en dispositivo | 1–2 h | Sí |
| **5** | Build production (AAB) | 30–60 min (espera cloud) | Sí |
| **6** | Google Play Console (Internal testing) | 2–4 h | Sí |
| **7** | Smoke test final → listo para Production | 1–2 h | Sí |

**Orden estricto:** 0 → 1 → 2 → 4 (preview) → 5 (production) → 6 → 7. La fase 3 puede hacerse en paralelo con la 2.

---

## Definición de “lista para build production”

La app se considera **óptima para production build** cuando:

- [ ] `npx expo-doctor` pasa **18/18**
- [ ] `npx tsc --noEmit` sin errores
- [ ] Todo el código MVP está **commiteado** (sin `git status` sucio en archivos de app)
- [ ] EAS Secrets `production` configurados
- [ ] OAuth Google probado en APK/AAB **preview** en dispositivo físico
- [ ] Smoke test de funciones críticas aprobado (checklist Fase 4)
- [ ] `versionCode` remoto incrementado en expo.dev

---

## FASE 0 — Preparar el repositorio

> **Por qué:** Hoy el build fallaría la validación de Expo por el icono, y EAS tomaría código incompleto si no commiteas el MVP.

### 0.1 Corregir assets (bloqueante)

**Problema:** `app.json` usa `sportmatch-logo.png` (1181×1653, rectangular) como `icon` y `adaptiveIcon`. Expo exige cuadrado.

**Acción en `app.json`:**

| Campo | Cambiar de | Cambiar a |
|-------|------------|-----------|
| `icon` | `./assets/sportmatch-logo.png` | `./assets/icon.png` |
| `android.adaptiveIcon.foregroundImage` | `./assets/sportmatch-logo.png` | `./assets/icon.png` |
| `expo-notifications` plugin `icon` | `./assets/sportmatch-logo.png` | `./assets/icon.png` |
| `splash.image` | *(opcional)* | Mantener `sportmatch-logo.png` con `resizeMode: contain` **o** usar `splash-icon.png` |

> El **splash** puede seguir siendo rectangular con `contain` + fondo negro. Solo `icon` y `adaptiveIcon` deben ser cuadrados.

**Verificar:**

```bash
npx expo-doctor
# Debe mostrar: 18/18 checks passed
```

### 0.2 Limpiar artefactos de build

Los APK en la raíz no deben versionarse:

```bash
# Opcional: borrar locales
rm -f build-*.apk
```

Añadir a `.gitignore`:

```
build-*.apk
*.aab
```

### 0.3 Commitear trabajo MVP pendiente

Archivos que deben entrar al commit de release:

```
components/chat-screen.tsx
components/match-completion-panel.tsx
components/match-detail-screen.tsx
components/profile-screen.tsx
components/public-player-profile-modal.tsx
components/profile-share-card.tsx          (nuevo)
lib/app-provider.tsx
lib/match-review-eligibility.ts            (nuevo)
lib/share-profile-instagram.ts             (nuevo)
lib/supabase/mvp-queries.ts                (nuevo)
lib/supabase/public-player-profile.ts
lib/supabase/rating-queries.ts
lib/types.ts
package.json
package-lock.json
scripts/player-mvp-stats-migration.sql     (referencia, ya ejecutado)
DOCUMENTACION-MOVIL-NOTIFICACIONES-RESEÑAS-MVP.md
AUDITORIA-PRODUCCION-GOOGLE-PLAY-2026-06-07.md
PLAN-PRODUCCION-GOOGLE-PLAY.md
```

**Mensaje de commit sugerido:**

```
feat(mobile): reseñas unificadas, MVP stats y compartir perfil para release

Incluye fix de icono cuadrado para expo-doctor y documentación de release.
```

### 0.4 (Opcional, post-v1) Bug género en registro email

`auth-screen.tsx` fija `gender = 'male'`. No bloquea Play; programar fix en v1.0.1 si no entra en este release.

---

## FASE 1 — Validación local pre-build

Ejecutar en orden:

```bash
cd /Users/pirloko/Desktop/PROYECTOS/PROYECTO01/COPIAconExpo

# 1. Dependencias alineadas
npm install

# 2. TypeScript
npx tsc --noEmit

# 3. Salud Expo
npx expo-doctor

# 4. Manifest Android (permisos)
npx expo prebuild --platform android --no-install --clean
grep uses-permission android/app/src/main/AndroidManifest.xml
```

**Resultado esperado del grep:**

- Activos: `INTERNET`, `VIBRATE`
- Con `tools:node="remove"`: `CAMERA`, `RECORD_AUDIO`, `READ/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`

**Checklist Fase 1:**

- [ ] `tsc` OK
- [ ] `expo-doctor` 18/18
- [ ] Permisos manifest correctos
- [ ] `git status` limpio (o solo cambios intencionados)

---

## FASE 2 — Configuración externa (EAS + Supabase + Google)

### 2.1 EAS Secrets — perfil `production`

En [expo.dev](https://expo.dev) → proyecto **sportmatch** → **Environment variables** → **production**:

| Variable | Valor | Obligatoria |
|----------|-------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` | ✅ |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key | ✅ |
| `EXPO_PUBLIC_SITE_URL` | `https://www.sportmatch.cl` | ✅ Recomendada |
| `EXPO_PUBLIC_SENTRY_DSN` | DSN Sentry | Recomendada |

**No incluir en la app:** `SUPABASE_SERVICE_ROLE_KEY` (solo servidor/cron).

**Checklist:**

- [ ] Variables guardadas en perfil `production`
- [ ] Re-build tras cualquier cambio de env (EAS no reutiliza env de builds anteriores automáticamente en todos los casos)

### 2.2 Supabase Auth (verificación rápida)

Ya tienes SQL ejecutado. Solo confirma en Dashboard:

| Ítem | Valor |
|------|-------|
| Redirect URLs | `sportmatch://auth/callback` |
| Site URL | `https://www.sportmatch.cl` |
| Google → Client IDs | `WEB_ID,ANDROID_ID` (separados por coma) |
| Google → Client Secret | Solo del cliente **Web** |

### 2.3 Google Cloud — OAuth Android (crítico)

```bash
npx eas-cli login
npx eas-cli credentials -p android
# Seleccionar perfil production → copiar SHA-1 del keystore de subida
```

En Google Cloud Console → Credentials → OAuth client **Android**:

| Campo | Valor |
|-------|-------|
| Package name | `com.pichanga.expo` |
| SHA-1 | Huella del keystore **EAS production** (no debug local) |

Copiar el **Client ID Android** y añadirlo en Supabase (paso 2.2).

**Checklist:**

- [ ] SHA-1 production registrado en Google Cloud
- [ ] Client ID Android en Supabase
- [ ] OAuth consent screen publicado o tu email en usuarios de prueba

### 2.4 Versionado remoto

`eas.json` usa `"appVersionSource": "remote"`.

En expo.dev → proyecto → **App versions**:

- [ ] `versionCode` = **1** para primera subida (o mayor si ya subiste antes)
- [ ] `versionName` = `1.0.0` (visible al usuario)

> Antes de cada nueva subida a Play, incrementar `versionCode` (entero, siempre mayor).

---

## FASE 3 — Push notifications (recomendado antes de Play)

SQL ya ejecutado. Falta infra de envío:

### 3.1 FCM v1 en EAS

1. expo.dev → **Credentials** → **Android** → **production**
2. Configurar **FCM V1** (subir JSON de service account de Firebase o seguir wizard Expo)

### 3.2 Cron de despacho (servidor)

El script `npm run notifications:dispatch` necesita en CI/servidor:

```bash
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Programar cada **5–15 min** (GitHub Actions, Vercel Cron, etc.).

> **Importante:** No correr dos crons en paralelo (web + móvil) que marquen el mismo `push_sent_at`.

**Checklist Fase 3:**

- [ ] FCM v1 configurado en EAS
- [ ] Cron activo en servidor
- [ ] Probar: crear notificación in-app → cron la envía → llega al dispositivo

> Si lanzas v1 **sin** push remoto, puedes posponer Fase 3, pero decláralo en Data Safety solo si realmente no activas el cron.

---

## FASE 4 — Build PREVIEW + QA en dispositivo

**Nunca saltes directo a production sin probar preview.**

### 4.1 Generar APK preview

```bash
npx eas-cli build --platform android --profile preview
```

Esperar en expo.dev. Descargar APK.

### 4.2 Instalar en dispositivo físico

```bash
# Desinstalar builds anteriores primero
adb install ruta/al/build.apk
```

### 4.3 Smoke test obligatorio (marcar cada ítem)

#### Auth y sesión
- [ ] App abre sin crash
- [ ] **Continuar con Google** → login completo
- [ ] Cerrar app y reabrir → **sesión restaurada**
- [ ] Login email (si lo usas en prod)
- [ ] Logout funciona

#### Núcleo jugador
- [ ] Home carga partidos
- [ ] Explorar centros
- [ ] Partidos: listado, detalle, chat
- [ ] Crear / unirse a partido
- [ ] Equipos: crear, invitar
- [ ] Onboarding jugador (si cuenta nueva)

#### MVP y reseñas (recién commiteado)
- [ ] Partido finalizado → formulario reseña unificada (recinto, ambiente, nivel, MVP)
- [ ] No permite auto-elegirse MVP
- [ ] Contador MVP visible en perfil propio
- [ ] Perfil público muestra stats MVP

#### Notificaciones
- [ ] Al login, pide permiso notificaciones (Android 13+)
- [ ] Token registrado (revisar tabla `mobile_push_subscriptions` en Supabase)
- [ ] Centro notificaciones (`/notificaciones`) con badge en home
- [ ] Tap en push abre ruta correcta (si Fase 3 activa)

#### Compliance
- [ ] Perfil → Configuración → **Eliminar mi cuenta** (cuenta de prueba) → vuelve a login
- [ ] Términos y Privacidad abren desde login
- [ ] Cambiar foto perfil → solo galería (no pide cámara ni micrófono)

#### Compartir (nuevo)
- [ ] Compartir perfil en Instagram / sheet nativo funciona

#### Logs OAuth (si algo falla)

```bash
adb logcat | grep -E '\[OAuth\]|\[Exchange\]|\[AuthCallback\]|\[Hydrate\]'
```

Opcional en EAS preview: `EXPO_PUBLIC_AUTH_DEBUG=1`

**Criterio de salida Fase 4:** Todos los ítems críticos (auth, sesión, reseñas, eliminar cuenta, legales) en ✅. Si falla OAuth → volver a Fase 2.3 (SHA-1).

---

## FASE 5 — Build PRODUCTION (AAB)

Solo cuando Fase 4 esté verde.

```bash
npx eas-cli build --platform android --profile production
```

- Formato: **`.aab`** (Android App Bundle)
- Descargar desde expo.dev al terminar
- Anotar `versionCode` y commit hash del build en expo.dev (trazabilidad)

**Checklist:**

- [ ] Build terminó sin errores
- [ ] AAB descargado
- [ ] Mismo commit que pasó QA preview (o commit posterior con fix mínimo + nuevo preview si hubo cambios)

### 5.1 (Opcional) Mejorar observabilidad Sentry

Para crashes legibles en producción:

1. Añadir `SENTRY_AUTH_TOKEN` en EAS Secrets
2. Añadir `SENTRY_ORG` y `SENTRY_PROJECT`
3. Quitar o poner `SENTRY_DISABLE_AUTO_UPLOAD: false` solo en perfil `production` en `eas.json`
4. Nuevo build production

---

## FASE 6 — Google Play Console (Internal Testing)

### 6.1 Cuenta y app

1. [Google Play Console](https://play.google.com/console)
2. Crear app **SportMatch** (si no existe)
3. Activar **Play App Signing** (recomendado: Google gestiona clave de firma)

### 6.2 Store listing (mínimo para internal testing)

| Elemento | Acción |
|----------|--------|
| Título | SportMatch |
| Descripción corta | Redactar (máx. 80 caracteres) |
| Descripción completa | Beneficios: partidos, equipos, centros |
| Icono 512×512 | Exportar desde `assets/icon.png` |
| Feature graphic 1024×500 | Crear (obligatorio para listing completo) |
| Screenshots | Mín. 2 del teléfono (capturas reales de la app) |
| Categoría | Deportes o Social |
| Email contacto | `ancodevs.spa@gmail.com` |
| Sitio web | `https://www.sportmatch.cl` |

### 6.3 Política y cumplimiento

| Sección | Valor / acción |
|---------|----------------|
| Privacy policy URL | `https://www.sportmatch.cl/privacidad` |
| Data safety | Email, nombre, foto, mensajes, IDs; **no** GPS, **no** micrófono, **no** cámara |
| Account deletion | In-app: Perfil → Configuración → Eliminar mi cuenta |
| Content rating | Completar cuestionario IARC |
| Target audience | Según edad mínima del registro |
| Ads | No (si no hay anuncios) |
| App access | Instrucciones + cuenta de prueba para revisores Google |

**Texto sugerido para revisores:**

> Iniciar sesión con Google o email de prueba. OAuth redirect: `sportmatch://auth/callback`. La app está orientada a jugadores; centros y admin usan la web en sportmatch.cl.

### 6.4 Subir AAB

1. **Testing** → **Internal testing**
2. **Create new release**
3. Upload AAB de EAS
4. Notas: "Primera versión — jugadores, partidos, equipos, reseñas MVP"
5. **Review release** → **Start rollout**
6. Añadirte como tester (Gmail) → abrir enlace opt-in → instalar desde Play

---

## FASE 7 — Validación final y paso a Production

### 7.1 Probar desde Play Internal Testing

Repetir checklist corto en el build instalado **desde Play** (no sideload):

- [ ] Google OAuth
- [ ] Sesión persistente
- [ ] Reseña + MVP
- [ ] Eliminar cuenta (cuenta desechable)
- [ ] Notificaciones (si Fase 3 activa)

### 7.2 Promover a Production

Cuando Internal Testing esté OK:

1. **Production** → **Create new release**
2. Mismo AAB (o nuevo con `versionCode` incrementado)
3. Países: Chile (o los que definas)
4. Enviar a revisión

Tiempo de revisión Google: horas a varios días.

### 7.3 Motivos frecuentes de rechazo (evitar)

| Motivo | Prevención |
|--------|------------|
| Privacy URL rota | Ya verificada ✅ |
| Data safety ≠ permisos | Solo INTERNET + VIBRATE + galería runtime |
| Sin borrar cuenta | Flujo in-app ✅ |
| Revisores no pueden entrar | App access + cuenta prueba |
| OAuth roto en release | SHA-1 EAS production |

---

## Cronograma sugerido (1–2 días)

### Día 1 — Repo + config + preview

| Hora | Tarea |
|------|-------|
| Mañana | Fase 0 (icono, commit, gitignore) |
| Mañana | Fase 1 (validación local) |
| Mediodía | Fase 2 (EAS secrets, OAuth SHA-1) |
| Tarde | Fase 4 (build preview + smoke test) |
| Paralelo | Fase 3 (FCM + cron) si hay tiempo |

### Día 2 — Production + Play

| Hora | Tarea |
|------|-------|
| Mañana | Fase 5 (build production AAB) |
| Mediodía | Fase 6 (Play Console, internal testing) |
| Tarde | Fase 7 (validar desde Play, enviar a Production si todo OK) |

---

## Comandos de referencia rápida

```bash
# Validación
npx tsc --noEmit
npx expo-doctor

# Credenciales Android (SHA-1)
npx eas-cli credentials -p android

# Builds
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production

# Submit automático (opcional, tras configurar service account)
npx eas-cli submit --platform android --profile production

# Logs dispositivo
adb logcat | grep -E '\[OAuth\]|\[Exchange\]|\[AuthCallback\]'
```

---

## Estado del plan (actualizar al avanzar)

| Fase | Estado | Fecha |
|------|--------|-------|
| SQL Supabase | ✅ Hecho | — |
| 0 — Repo | ⬜ Pendiente | |
| 1 — Validación local | ⬜ Pendiente | |
| 2 — EAS + OAuth | ⬜ Pendiente | |
| 3 — Push FCM + cron | ⬜ Pendiente | |
| 4 — Preview + QA | ⬜ Pendiente | |
| 5 — Production AAB | ⬜ Pendiente | |
| 6 — Play Internal | ⬜ Pendiente | |
| 7 — Production live | ⬜ Pendiente | |

---

## Siguiente acción inmediata

**Empezar por Fase 0.1:** cambiar `icon` y `adaptiveIcon` en `app.json` a `./assets/icon.png`, luego commitear todo el MVP.

Cuando quieras, puedo ejecutar la Fase 0 en el código por ti (icono + `.gitignore` + verificación `expo-doctor`).

---

*Plan generado el 7 de junio de 2026. SQL Supabase marcado como completado por el equipo.*
