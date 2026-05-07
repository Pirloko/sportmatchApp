# Fase 0.5 — Alineación de dependencias Expo (SDK 54)

Fecha: 2026-05-06  
Rama: `feature-carlos`

## Objetivo

Corregir el desalineamiento **SDK 54 vs paquetes 55**, duplicado de `expo-constants` y peer faltante **`expo-font`**, sin cambiar lógica de negocio.

## Acciones ejecutadas

- `npx expo install --fix` (iteraciones hasta alinear módulos nativos).
- `npx expo install expo-font expo-device expo-image-picker expo-linking expo-notifications expo-web-browser babel-preset-expo`.
- Plugins añadidos en `app.json`: `expo-web-browser`, `expo-font` (por Expo CLI al instalar).

## Ajuste de código mínimo

- **`lib/push/register-device.ts`**: en `expo-notifications@~0.32.17`, `getExpoPushTokenAsync` es **export default**; el import dinámico usa `{ default: getExpoPushTokenAsync }`.

## Limpieza `package.json`

- **`babel-preset-expo`** quedó solo en `devDependencies` (eliminado duplicado en `dependencies`).

## Verificación

| Check | Resultado |
|-------|-----------|
| `npx expo-doctor` | **17/17** |
| `npx tsc --noEmit` | **OK** |

## Archivos tocados

- `package.json`, `package-lock.json`
- `app.json`
- `lib/push/register-device.ts`
- Este documento

## Rollback

```bash
git revert HEAD
```

(o revert del commit que documente esta fase).

## Próximo paso

**Fase 1 — Observabilidad** (Sentry + eventos mínimos), según `mejoras.md`.
