# Fase 2 — App Provider y rerenders (100% alcance `mejoras.md`)

Fecha: 2026-05-07  
Rama: `feature-carlos`

## Objetivo (`mejoras.md` — Fase 2)

Reducir rerenders globales del `AppProvider` sin refactor masivo, aplicando:

- `useMemo` del `value` del contexto
- `useCallback` consistente en acciones expuestas
- memoización estructural para estados calientes
- selectores derivados memoizados

## Cambios implementados

### 1) `value` del contexto estabilizado

- Se mantiene `useMemo<AppContextType>` para `value` de `AppContext`.
- Flags derivados (`isAuthenticated`, `needsOnboarding`, `needsVenueOnboarding`) permanecen calculados dentro del `useMemo`.

### 2) Memoización estructural en listas calientes

En `lib/app-provider.tsx` se añadió:

- `arraysEqualByKey` y `setArrayStateIfChanged`.
- Setters estables por dominio:
  - `setMatchOpportunitiesStable`
  - `setUsersStable`
  - `setTeamsStable`
  - `setTeamInvitesStable`
  - `setTeamJoinRequestsStable`
  - `setRivalChallengesStable`
  - `setParticipatingOpportunityIdsStable`

Estos setters evitan reemplazar el estado cuando la colección nueva tiene mismas claves y orden, reduciendo invalidaciones innecesarias del `value` del contexto.

### 3) Selectores derivados memoizados

Se añadieron selectores derivados con `useMemo` + funciones estables con `useCallback`:

- `matchesByGender` + `getFilteredMatches`
- `myTeams` + `getUserTeams`
- `teamsByGender` + `getFilteredTeams`
- `usersByGender` + `getFilteredUsers`

Con esto, los consumidores reutilizan referencias estables mientras no cambie la fuente.

### 4) Aplicación incremental en flujos críticos

Se aplicaron los setters estables en refrescos y mutaciones más calientes:

- hidratación inicial de datos de jugador
- `refreshMatchData`
- `refreshTeamData`
- join/accept de partidos e invitaciones
- desafíos rival (`respondToRivalChallenge`, `acceptRivalOpportunityWithTeam`)
- refrescos de invitaciones y solicitudes de equipo
- creación de partidos con refetch posterior

## Qué no se tocó (por seguridad)

- No se separó `AppProvider` en múltiples contextos.
- No se cambió API pública de `useApp()`.
- No se modificó lógica de negocio (auth, RLS, RPC, navegación, realtime).

## Impacto esperado

- Menor propagación de renders cuando Supabase devuelve datos equivalentes.
- Menor churn de objetos/arrays en selectores usados por pantallas de partidos/equipos.
- Mejor estabilidad general del árbol sin cambios arquitectónicos destructivos.

## Verificación

- `npx tsc --noEmit` ✅
- `npx expo-doctor` ✅ (17/17)
- `ReadLints` sobre `lib/app-provider.tsx` ✅ sin errores

## Archivos modificados

- `lib/app-provider.tsx`
- Este documento

## Riesgos y pruebas manuales recomendadas

- Validar login/logout e hidratación de sesión.
- Validar joins/invitaciones/desafíos (sin regresiones funcionales).
- Revisar que listas de partidos/equipos sigan actualizando tras acciones.

## Rollback

```bash
git revert <commit>
```

## Siguiente fase sugerida

Con Fase 2 cerrada al 100%, el siguiente bloque natural es **Fase 4 — SQL y performance backend** (Fase 3 ya fue cerrada).
