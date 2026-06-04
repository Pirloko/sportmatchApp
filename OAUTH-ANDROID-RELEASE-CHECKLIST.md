# Checklist — Google OAuth Android APK (post-implementación)

Usar tras instalar un **APK nuevo** generado con EAS (`preview` o `production`) que incluya:

- `expo-crypto` + `react-native-get-random-values` (polyfill `crypto.subtle.digest` en `lib/supabase/polyfills.ts`)
- **Sin** `react-native-quick-crypto` (puede crashear al abrir la app con `newArchEnabled: false`)
- Singleton `getSupabase()` en `lib/supabase/client.ts`
- Polyfill en `lib/supabase/polyfills.ts` (cargado desde `instrumentation.ts`)

---

## 1. Google Cloud Console

| Ítem | Valor / acción |
|------|----------------|
| Cliente **Web** | Redirect URI: `https://fnrsjmgdlsrvpuqbcggm.supabase.co/auth/v1/callback` |
| Cliente **Android** | Package: `com.pichanga.expo` |
| SHA-1 Android | Huella del **keystore EAS** (Expo → Credentials → Android), no la de debug local |
| OAuth consent | Publicado o tu email en usuarios de prueba |

---

## 2. Supabase Dashboard

| Ítem | Valor |
|------|--------|
| Authentication → Google → **Client IDs** | `WEB_ID.apps.googleusercontent.com,ANDROID_ID.apps.googleusercontent.com` (coma) |
| Client Secret | Solo del cliente **Web** |
| Redirect URLs | `sportmatch://auth/callback` |
| Redirect URLs (dev) | `exp://…/--/auth/callback` si pruebas Expo Go |
| Redirect URLs (web) | `https://sportmatch.cl/**`, `https://www.sportmatch.cl/**` |
| Site URL | `https://www.sportmatch.cl` |

---

## 3. EAS Build

| Ítem | Acción |
|------|--------|
| Variables en perfil `preview` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Commit del build | Debe incluir cambios OAuth/PKCE/polyfill (revisar en expo.dev) |
| Comando | `npx eas-cli build --platform android --profile preview` |
| Debug en APK | Opcional: `EXPO_PUBLIC_AUTH_DEBUG=1` en EAS env |

**Nota:** `react-native-quick-crypto` requiere **prebuild nativo** (EAS Build). No sustituye probar solo en Expo Go sin rebuild.

---

## 4. Prueba en dispositivo

1. Desinstalar APK anterior.
2. Instalar APK nuevo.
3. Pulsar **Continuar con Google**.
4. Debe abrirse selector de cuentas Google en pocos segundos.
5. Tras elegir cuenta → breve spinner en `/auth/callback` → app logueada.

### Logs (opcional)

```bash
adb logcat | grep -E '\[OAuth\]|\[PKCE\]|\[DeepLink\]|\[AuthCallback\]|\[Exchange\]'
```

---

## 5. URL authorize esperada

Al pulsar Google (con `EXPO_PUBLIC_AUTH_DEBUG=1` o `__DEV__`):

| Parámetro | Esperado en Android APK |
|-----------|-------------------------|
| `provider` | `google` |
| `redirect_to` | `sportmatch://auth/callback` (URL-encoded) |
| `code_challenge` | presente |
| `code_challenge_method` | **`s256`** (no `plain`) |
| `skip_http_redirect` | ausente en flujo móvil actual |

Si sigue `plain`:

- Polyfill no cargó → revisar que `instrumentation.ts` importe `./lib/supabase/polyfills` primero.
- Rebuild nativo incompleto → nuevo EAS build.

---

## 6. PKCE esperado (runtime)

Logs `[PKCE]`:

```
method: s256
has_challenge: true
crypto_subtle: true
```

---

## 7. Resultado esperado

| Paso | Resultado |
|------|-----------|
| Authorize | Redirige a Google |
| Callback | `sportmatch://auth/callback?code=…` |
| Exchange | `[Exchange] exchange OK` |
| Sesión | `getUser()` con email |
| Perfil | `fetchProfileForUser` OK (o error explícito si falta fila en DB) |

---

## 8. Web (no romper)

| Plataforma | flowType | Método challenge |
|------------|----------|------------------|
| Web | `implicit` | N/A en authorize (tokens en redirect web) |
| Android/iOS | `pkce` | `s256` con polyfill |

Probar login web en `https://www.sportmatch.cl` tras el deploy si compartís bundle web.

---

## 9. Deep link manual (Android)

```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "sportmatch://auth/callback?code=test" \
  com.pichanga.expo
```

La app debe abrir; `code=test` fallará en exchange (esperado).
