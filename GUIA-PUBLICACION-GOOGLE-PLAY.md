# Guía paso a paso — Publicar SportMatch en Google Play

**Objetivo:** Subir el AAB a Google Play Console y publicar la app móvil SportMatch.  
**Package Android:** `com.pichanga.expo`  
**Build EAS:** `eas build --platform android --profile production`

---

## Estado previo (checklist rápido)

| Paso | Estado |
|------|--------|
| SQL `delete_own_account` en Supabase | ✅ Ya ejecutado |
| Código release (permisos, legales, eliminar cuenta) | ✅ En el repo |
| Secrets EAS + OAuth Google + Play Console | ⬜ Pendiente (esta guía) |

---

## Fase 1 — Supabase Auth (15 min)

### 1.1 Redirect URLs

1. Entra a [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto.
2. **Authentication** → **URL Configuration**.
3. En **Redirect URLs**, añade (si no están):

   ```
   sportmatch://auth/callback
   ```

4. Para desarrollo con Expo Go (opcional):

   ```
   exp://127.0.0.1:8081/--/auth/callback
   exp://localhost:8081/--/auth/callback
   ```

5. **Site URL** (web): `https://www.sportmatch.cl` (o tu dominio oficial).

### 1.2 Google provider en Supabase

1. **Authentication** → **Providers** → **Google** → habilitado.
2. **Client IDs:** Web + Android separados por coma, por ejemplo:

   ```
   TU_CLIENT_ID_WEB.apps.googleusercontent.com,TU_CLIENT_ID_ANDROID.apps.googleusercontent.com
   ```

3. **Client Secret:** solo el del cliente **Web** (no el de Android).

### 1.3 Probar eliminación de cuenta (opcional)

En SQL Editor:

```sql
SELECT proname FROM pg_proc WHERE proname = 'delete_own_account';
```

Debe devolver una fila.

---

## Fase 2 — Google Cloud Console (20 min)

### 2.1 OAuth consent screen

1. [Google Cloud Console](https://console.cloud.google.com/) → proyecto vinculado a Supabase/Google login.
2. **APIs & Services** → **OAuth consent screen**.
3. Tipo: **External** (o Internal si aplica).
4. Completa: nombre **SportMatch**, email de soporte, logo.
5. **Publishing status:** en prueba → añade tu email como usuario de prueba; para producción → **Publish app** cuando esté listo.

### 2.2 Cliente OAuth Web (ya usado por Supabase)

1. **Credentials** → cliente tipo **Web application**.
2. **Authorized redirect URIs** debe incluir:

   ```
   https://TU-PROYECTO.supabase.co/auth/v1/callback
   ```

   (La URL exacta aparece en Supabase → Auth → Google.)

### 2.3 Cliente OAuth Android (crítico para la app)

1. **Create credentials** → **OAuth client ID** → **Android**.
2. **Package name:** `com.pichanga.expo`
3. **SHA-1:** huella del keystore de **producción EAS**, no la de debug local.

#### Obtener SHA-1 de EAS

```bash
npx eas-cli credentials -p android
```

Elige el perfil **production** y copia el **SHA-1** del keystore de subida.

O en [expo.dev](https://expo.dev) → tu proyecto → **Credentials** → Android → production.

4. Guarda el **Client ID Android** y añádelo en Supabase (paso 1.2).

> Sin este SHA-1 correcto, Google OAuth falla en el APK/AAB de Play.

---

## Fase 3 — Variables EAS (10 min)

### 3.1 Secrets en expo.dev

1. [expo.dev](https://expo.dev) → proyecto **sportmatch** → **Environment variables**.
2. Perfil **production** — variables **obligatorias**:

   | Variable | Ejemplo |
   |----------|---------|
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon key) |

3. **Recomendadas:**

   | Variable | Uso |
   |----------|-----|
   | `EXPO_PUBLIC_SITE_URL` | `https://www.sportmatch.cl` |
   | `EXPO_PUBLIC_SENTRY_DSN` | Errores en producción |

4. No subas secrets al repo; `.env` local solo para desarrollo.

Referencia: `EAS-PRODUCTION-SECRETS.md`

### 3.2 Versionado

En `eas.json` tienes `"appVersionSource": "remote"`.

1. En expo.dev → **Project** → **App versions** (o al subir build).
2. Antes de cada release nuevo, **incrementa `versionCode`** (entero mayor que el anterior).
3. `versionName` en `app.json` es `1.0.0` (visible al usuario); puedes subirla cuando quieras (ej. `1.0.1`).

---

## Fase 4 — Generar el AAB (30–60 min)

### 4.1 Pre-build local (opcional)

```bash
cd /ruta/a/COPIAconExpo
npx expo-doctor
npx tsc --noEmit
```

### 4.2 Build production

```bash
npx eas-cli login
npx eas-cli build --platform android --profile production
```

- Espera a que termine en expo.dev.
- Descarga el archivo **`.aab`** (Android App Bundle).

### 4.3 Probar antes de Play (muy recomendado)

Opciones:

- **Internal testing** en Play (subes el AAB y te instalas desde enlace de prueba), o
- Instalar vía `bundletool` / dispositivo con el AAB firmado.

**Checklist en dispositivo real:**

- [ ] Abre la app sin crash
- [ ] Login con **Google** completa y quedas logueado
- [ ] Cierras y reabres → **sesión restaurada**
- [ ] Login con email (si lo usas)
- [ ] Perfil → Configuración → **Eliminar mi cuenta** (cuenta de prueba)
- [ ] Términos y Privacidad abren desde login
- [ ] Cambiar foto de perfil (galería) — no debe pedir cámara/micrófono
- [ ] Notificaciones (si las usas) — aceptar permiso en Android 13+

Logs OAuth (opcional):

```bash
adb logcat | grep -E '\[OAuth\]|\[Exchange\]|\[AuthCallback\]'
```

Con `EXPO_PUBLIC_AUTH_DEBUG=1` en EAS si necesitas más detalle.

---

## Fase 5 — Cuenta Google Play Console (primera vez)

### 5.1 Crear cuenta de desarrollador

1. [Google Play Console](https://play.google.com/console)
2. Paga la cuota única de desarrollador (si es cuenta nueva).
3. Completa perfil de desarrollador (nombre, contacto).

### 5.2 Crear la aplicación

1. **Create app**
2. Nombre: **SportMatch**
3. Idioma predeterminado: **Español (Chile)** o el que prefieras
4. App o juego: **App**
5. Gratis o de pago: según tu modelo
6. Declaraciones iniciales (políticas, US export, etc.)

---

## Fase 6 — Ficha de la tienda (Store listing)

Ruta: **Grow** → **Store presence** → **Main store listing**

| Elemento | Requisito |
|----------|-----------|
| **Título** | SportMatch (máx. 30 caracteres) |
| **Descripción corta** | Máx. 80 caracteres |
| **Descripción completa** | Beneficios, partidos, equipos, centros |
| **Icono** | 512×512 PNG (tienes `assets/icon.png` 1024 — exportar/redimensionar) |
| **Feature graphic** | **1024×500** JPG o PNG (obligatorio) |
| **Screenshots teléfono** | Mín. 2 (recomendado 4–8), PNG o JPEG |
| **Categoría** | Deportes o Social (la más adecuada) |
| **Email de contacto** | Ej. `ancodevs.spa@gmail.com` |
| **Sitio web** | `https://www.sportmatch.cl` |

Opcional: tablet, video de YouTube.

---

## Fase 7 — Política y cumplimiento

### 7.1 Política de privacidad (URL pública obligatoria)

Play exige un **enlace HTTPS** accesible sin login.

Opciones:

- Publicar `POLITICA-DE-PRIVACIDAD.md` en tu web:  
  `https://www.sportmatch.cl/privacidad` (o `/privacy-policy`)
- La app ya muestra el texto en `/privacy-policy`; Play necesita **URL web** en la ficha.

En Play Console → **Policy** → **App content** → **Privacy policy** → pega la URL.

### 7.2 Data safety (seguridad de datos)

**Policy** → **App content** → **Data safety**

Declara de forma honesta (según tu app):

| Dato | ¿Recolectas? | Uso |
|------|--------------|-----|
| Email | Sí | Cuenta |
| Nombre, foto perfil | Sí | Perfil |
| Mensajes | Sí | Chat de partidos |
| Identificadores (user id, push token) | Sí | Cuenta / notificaciones |
| Ubicación precisa GPS | **No** (solo ciudad manual) |
| Audio / micrófono | **No** (bloqueado en manifest) |

Proveedores: Supabase, Google (login), Expo push, Sentry (si activo).

### 7.3 Eliminación de cuenta

**Policy** → **App content** → **Data deletion** (o sección equivalente)

Indica que el usuario puede **eliminar la cuenta en la app**:

- Jugador: **Perfil → Configuración → Eliminar mi cuenta**
- Centro: **Mi centro → Perfil → Eliminar mi cuenta**

Alternativa por correo: `ancodevs.spa@gmail.com`

### 7.4 Otras declaraciones

Completa todas las secciones de **App content** que Play marque como pendientes:

- Ads (¿contiene anuncios?)
- Target audience / edad
- Noticias / COVID si aplica
- Salud si aplica
- Permisos sensibles (no declares micrófono si no lo usas)

### 7.5 Clasificación de contenido

Cuestionario **Content rating** (IARC) — responde según chat, perfiles, deporte; suele salir **Everyone** o **Teen** según respuestas.

---

## Fase 8 — Subir el AAB

### 8.1 App signing

La primera vez Play te pedirá **Play App Signing**:

- Recomendado: **dejar que Google gestione la clave de firma** y subir el AAB firmado con EAS.

### 8.2 Canal de prueba (recomendado primero)

1. **Testing** → **Internal testing** (hasta 100 testers) o **Closed testing**
2. **Create new release**
3. **Upload** → selecciona el `.aab` de EAS
4. Notas de la versión (ej. “Primera versión pública”)
5. **Review release** → **Start rollout**

Añádete como tester con tu Gmail y abre el enlace de opt-in.

### 8.3 Producción

Cuando internal testing esté OK:

1. **Production** → **Create new release**
2. Sube el mismo (o nuevo) AAB con `versionCode` incrementado
3. **Countries/regions** → selecciona países (ej. Chile)
4. Envía a **revisión**

---

## Fase 9 — Cuentas de prueba para revisores de Google

En **Setup** → **License testing** / **App access**:

- Si el login es obligatorio: proporciona **cuenta de prueba** (email + contraseña) o instrucciones claras para Google OAuth.
- En “Instructions for reviewers”, indica:

  > Iniciar sesión con Google o email de prueba. OAuth redirect: sportmatch://auth/callback

Evita que los revisores queden bloqueados en login.

---

## Fase 10 — Revisión y publicación

1. Play Console mostrará **Pending publication** o **In review** (puede tardar horas o días).
2. Revisa el email por rechazos o solicitudes de cambios.
3. Motivos frecuentes de rechazo:
   - Política de privacidad URL rota
   - Data safety no coincide con permisos reales
   - Sin forma de borrar cuenta (ya resuelto en app + SQL)
   - OAuth / app no usable para revisores
4. Tras aprobación: **Production** → publicada.

---

## Orden sugerido (resumen en 10 pasos)

1. ✅ SQL `delete_own_account` — **hecho**
2. Supabase: Redirect URLs + Google Client IDs
3. Google Cloud: SHA-1 EAS en cliente Android
4. EAS Secrets production
5. `eas build --platform android --profile production`
6. Probar AAB en dispositivo real (OAuth + eliminar cuenta)
7. Play Console: crear app + store listing + assets
8. Privacy policy URL + Data safety + account deletion
9. Subir AAB a **Internal testing** → probar
10. Subir a **Production** → revisión Google

---

## Comandos de referencia

```bash
# Login EAS
npx eas-cli login

# Build production (AAB)
npx eas-cli build --platform android --profile production

# Ver credenciales Android (SHA-1)
npx eas-cli credentials -p android

# Submit automático (opcional, tras configurar submit)
npx eas-cli submit --platform android --profile production
```

---

## Documentación relacionada en el repo

| Archivo | Contenido |
|---------|-----------|
| `DOCUMENTACION-RELEASE-GOOGLE-PLAY.md` | Cambios técnicos implementados |
| `EAS-PRODUCTION-SECRETS.md` | Variables EAS |
| `OAUTH-ANDROID-RELEASE-CHECKLIST.md` | OAuth Android detallado |
| `POLITICA-DE-PRIVACIDAD.md` | Texto legal privacidad |
| `TERMINOS-DE-USO.md` | Texto legal términos |
| `AUDITORIA-GOOGLE-PLAY-RELEASE.md` | Auditoría inicial |

---

## Contactos y URLs de referencia

| Recurso | Valor |
|---------|--------|
| Package | `com.pichanga.expo` |
| Scheme OAuth | `sportmatch://auth/callback` |
| Sitio web | `https://www.sportmatch.cl` |
| Privacidad (contacto) | `ancodevs.spa@gmail.com` |

---

**Última actualización de esta guía:** mayo 2026
