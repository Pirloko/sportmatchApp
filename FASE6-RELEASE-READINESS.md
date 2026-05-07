# Fase 6 — Release readiness (incremento 6.1)

Fecha: 2026-05-07  
Rama: `feature-carlos`  
Referencia: `mejoras.md` — FASE 6.

## Objetivo de este incremento

Cambios **reversibles** en repo que alinean configuración móvil con stores y reducen riesgo operativo, **sin** reemplazar flujos de auth ni añadir dependencias pesadas.

## Cambios implementados en código / config

| Área | Cambio |
|------|--------|
| Deep links | Nuevo `lib/app-linking.ts`: esquema leído desde `Constants.expoConfig.scheme` (fallback `sportmatch`). OAuth y URLs de invitación sin `pichanga://` legacy. |
| Invitaciones equipo | `lib/team-invite-url.ts` usa `teamInviteDeepLinkFallback()` alineado a `app.json`. |
| OAuth Google | `lib/app-provider.tsx` usa `nativeAuthCallbackUrl()` y mensajes de error con la URI dinámica. |
| Android / iOS build | `app.json`: `android.versionCode`, `ios.buildNumber`. |
| Push (Android) | Plugin `expo-notifications` con `defaultChannel`, `icon`, `color` para canal por defecto en builds nativos. |
| Entorno | `.env.example`: `EXPO_PUBLIC_SITE_URL` documentada. |
| Comentarios | `lib/storage-keys.ts`: comentario de deep link actualizado al esquema real. |

## Checklist pendiente (manual / siguiente incremento)

No bloquean merge del 6.1 pero **sí** producción en tiendas:

1. **Sign in with Apple (iOS)**  
   Si entregas login social de terceros, Apple suele exigirse. Requiere: proveedor en Supabase, `expo-apple-authentication` o flujo web, entitlements en EAS, prueba en TestFlight.

2. **EAS `projectId`**  
   Push en dispositivo real necesita `extra.eas.projectId` en app config (típico tras `eas init`). Validar con build de preview y `register-device.ts`.

3. **Universal Links / App Links**  
   Dominio verificado (iOS `associatedDomains`, Android intent filters) para enlaces `https://` que abran la app. Depende de `EXPO_PUBLIC_SITE_URL` y hosting.

4. **Política de privacidad y términos**  
   URLs públicas para App Store Connect y Play Console; coherencia con permisos declarados (`expo-image-picker`, notificaciones).

5. **Secretos**  
   Rotación si hubo filtración; `SENTRY_AUTH_TOKEN` solo en EAS Secrets, no en `.env` versionado.

6. **Incremento de versiones por release**  
   Subir `version`, `android.versionCode`, `ios.buildNumber` en cada envío a stores.

## Validación local sugerida

```bash
npx tsc --noEmit
npx expo-doctor
npx expo prebuild --clean
```

(El `prebuild` solo si necesitas verificar proyecto nativo generado; no es obligación en cada commit.)

## Pruebas manuales

- Compartir invitación a equipo sin `EXPO_PUBLIC_SITE_URL`: el enlace debe usar `sportmatch://equipo/<uuid>` (o el `scheme` configurado).
- Login Google en dev build: Supabase debe incluir en “Additional Redirect URLs” la misma URI que `nativeAuthCallbackUrl()`.

## Rollback

```bash
git revert <commit>
```

## Archivos tocados (6.1)

- `lib/app-linking.ts` (nuevo)
- `lib/team-invite-url.ts`
- `lib/app-provider.tsx`
- `lib/storage-keys.ts` (comentario)
- `app.json`
- `.env.example`
- `FASE6-RELEASE-READINESS.md` (este documento)
