# Auditoría FINAL — Sesión + hydrate post-OAuth (Android APK)

**Fecha:** 2026-05-21  
**Estado confirmado:** PKCE s256, Google/Supabase `/authorize` + `/callback` OK, deep link llega.  
**Síntoma:** pantalla **“Completando inicio de sesión…”** sin avanzar.

---

## Diagnóstico exacto

**El flujo se rompe en `hydrateFromSession()` porque `fetchProfileForUser()` devuelve `null` y el código hacía `setCurrentUser(null)`, aunque `exchangeCodeForSession` ya hubiera guardado sesión en AsyncStorage.**

| Paso | ¿Funcionaba? | Evidencia |
|------|--------------|-----------|
| `exchangeCodeForSession` | Sí (típico) | Logs Supabase `/callback` 302 |
| `getSession()` tras exchange | Sí | Sesión en cliente |
| `getUser()` | Sí | Usuario auth |
| `fetchProfileForUser` → `profiles` | **A menudo NO** | Sin fila o RLS → `null` |
| `setCurrentUser(null)` | **Bug** | `isAuthenticated` = false |
| `app/auth/callback` | Espera `isAuthenticated` | Spinner infinito hasta timeout |

**No era:** Google Cloud, SHA-1, PKCE, provider Supabase.

**Era:** desacople **sesión auth** (Supabase Auth) vs **perfil app** (`profiles` + `currentUser`).

---

## Cadena rota (antes del fix)

```text
exchangeCodeForSession OK
  → onAuthStateChange(SIGNED_IN)
  → hydrateFromSession
  → fetchProfileForUser → null
  → setCurrentUser(null)   ← UI cree que no hay login
  → isAuthenticated = false
  → AuthCallback: "Completando inicio de sesión…" (12–15s)
  → router.replace("/") → login otra vez
```

---

## Fix aplicado en código (actualizado)

### 0. `lib/supabase/save-player-profile.ts` (onboarding)

- `completeOnboarding` usa **`upsert`** en `profiles` (no solo `UPDATE`).
- Tras guardar, **recarga** perfil con `fetchProfileForUser`.
- Quita el bucle infinito: `missingDbProfile` ya no persiste tras completar onboarding.

### 1. `lib/supabase/resolve-app-user.ts`

- Si hay fila en `profiles` → usuario normal.
- Si no → `buildFallbackUserFromAuth()` con `missingDbProfile: true` (**no** `setCurrentUser(null)`).

### 2. `lib/supabase/auth-profile-fallback.ts`

Usuario mínimo: `id`, `email`, `name` (metadata Google), `accountType: player`, etc.

### 3. `hydrateFromSession` (`lib/app-provider.tsx`)

- Logs `[Hydrate]`, `[CurrentUser]`.
- Usa `resolveAppUserFromAuth`.
- **Eliminado** el bloque que ponía `currentUser` a null si no hay perfil DB.

### 4. `loginWithGoogle` / `login` email

- Misma resolución; `needsOnboarding: true` si `missingDbProfile`.

### 5. `lib/complete-oauth-redirect.ts`

- Logs `[Exchange] starting`, `result` (session/user), `[Session] after exchange`, `[User] after exchange`.
- Valida `data.session` no null tras exchange.

### 6. `lib/supabase/queries.ts` — `fetchProfileForUser`

- Logs error RLS/SQL, fila ausente, OK.

### 7. `app/auth/callback.tsx`

- Logs `mounted`, `url`, `code_present`.
- Timeout solo si `exchangeDone && !isAuthenticated` (no esperar solo `authLoading`).

### 8. `needsOnboarding` en contexto

- También true si `currentUser.missingDbProfile`.

---

## Logs en APK

```bash
adb logcat | grep -E '\[Exchange\]|\[Session\]|\[User\]|\[Hydrate\]|\[AuthState\]|\[AuthCallback\]|\[CurrentUser\]|\[AuthLoading\]'
```

Activar: `EXPO_PUBLIC_AUTH_DEBUG=1` o `__DEV__`.

### Secuencia sana esperada

```text
[Exchange] starting
[Exchange] result → session.user_id, user.email
[Session] after exchange getSession → has session
[User] after exchange getUser
[AuthState] SIGNED_IN
[Hydrate] session exists true
[Hydrate] fetching profile
[Hydrate] fetchProfileForUser no row   ← si no hay fila
[Hydrate] profile null → fallback user
[CurrentUser] set after hydrate source=fallback
[AuthCallback] isAuthenticated true
[Navigation] AuthCallback → Redirect /
```

---

## Verificación en Supabase (perfil DB)

Si ves `fetchProfileForUser no row`:

1. Tabla `profiles`, columna `id` = `auth.users.id`.
2. Trigger `on auth.users insert` creando perfil (si existe en web).
3. RLS: `SELECT` permitido para `auth.uid() = id`.

El fallback permite usar la app; el usuario debería completar onboarding / crear fila en `profiles`.

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `lib/supabase/auth-profile-fallback.ts` | Nuevo |
| `lib/supabase/resolve-app-user.ts` | Nuevo |
| `lib/supabase/queries.ts` | Logs SQL/RLS |
| `lib/complete-oauth-redirect.ts` | Logs exchange + validación session |
| `lib/app-provider.tsx` | hydrate + login + AuthLoading logs |
| `lib/auth/auth-debug.ts` | Tags Hydrate, User, CurrentUser, AuthLoading |
| `lib/types.ts` | `missingDbProfile?` |
| `app/auth/callback.tsx` | Logs + timeout lógica |

---

## Próximo paso

**Nuevo APK EAS** con estos cambios → probar Google login.

Si entra con fallback → revisar creación de fila en `profiles` en Supabase (trigger o signup web).
