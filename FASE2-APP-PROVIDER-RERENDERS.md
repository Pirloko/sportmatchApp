# Fase 2 — App Provider y rerenders (incremental)

Fecha: 2026-05-07  
Rama: `feature-carlos`

## Objetivo (mejoras.md)

Reducir **referencias inestables** del contexto y preparar el terreno para menos trabajo en reconciliación, **sin** separar providers ni refactor masivo.

## Cambio realizado

### `useMemo` del objeto `value` de `AppContext`

- **Antes:** en cada render de `AppProvider` se creaba un **objeto nuevo** `value`, aunque los campos fueran iguales (p. ej. re-renders por estado interno que no afecta al contexto en teoría, o patrones de doble render en desarrollo).
- **Ahora:** `value` solo cambia de identidad cuando cambia **algún estado expuesto** o **alguna función** incluida en el array de dependencias (alineado con el contrato real del contexto).

Los flags derivados `isAuthenticated`, `needsOnboarding` y `needsVenueOnboarding` se calculan **dentro** del `useMemo`, eliminando variables intermedias en cada render.

## Qué no se hizo (acorde al plan)

- No se dividió el provider en varios contextos.
- No se reescribieron callbacks con refs para recortar dependencias (riesgo de regresión).
- No se tocó la API pública de `useApp()`.

## Impacto esperado

- **Moderado en desarrollo:** menos propagación de un `value` nuevo cuando el árbol del provider se monta/actualiza sin cambiar datos del contexto.
- **En producción:** el cuello de botella principal sigue siendo que **cualquier cambio en listas calientes** (`matchOpportunities`, `teams`, etc.) sigue invalidando `value`; eso se abordará en fases posteriores (React Query / providers por dominio).

## Verificación

- `npx tsc --noEmit`

## Archivos modificados

- `lib/app-provider.tsx`
- Este documento

## Rollback

```bash
git revert <commit>
```

## Próximo paso sugerido

**Fase 3 — Chat y realtime** (`mejoras.md`), o micro-optimización adicional de callbacks solo si se mide un cuello concreto.
