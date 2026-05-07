# Auditoria Profunda de AppProvider y Estado Global - SportMatch

Fecha: 2026-05-06  
Alcance: analisis tecnico del estado global actual, con foco en `lib/app-provider.tsx` y consumidores de `useApp()`.  
Objetivo: detectar riesgos de re-render, acoplamiento, escalabilidad movil y definir plan gradual de refactor sin romper produccion.

---

## Resumen ejecutivo

La arquitectura de estado actual esta dominada por un Context monolitico (`AppProvider`) que mezcla multiples dominios de negocio y expone una superficie muy amplia.  
Esto genera:
- rerenders globales innecesarios,
- alto acoplamiento entre pantallas y dominios,
- invalidacion manual fragil de datos remotos,
- y una migracion incompleta a React Query.

El camino recomendado es una migracion gradual tipo **strangler pattern**: mantener compatibilidad de `useApp()` mientras se mueve lectura/mutacion por dominio a hooks especializados con React Query.

---

## 1) Que estados causan rerenders innecesarios

Problema estructural principal:
- `AppProvider` arma un `value` grande que cambia en cada render y es consumido por muchas pantallas.
- Cualquier `setState` interno del provider puede disparar rerender en consumidores no relacionados funcionalmente.

Slices con mayor impacto de rerender global:
- `matchOpportunities`
- `participatingOpportunityIds`
- `teams`
- `teamInvites`
- `teamJoinRequests`
- `rivalChallenges`
- `currentUser`
- `venueForOwner`
- `onboardingSource`
- `teamsDetailFocusTeamId`
- `authLoading`

Patrones que amplifican renders:
- `refreshMatchData()` actualiza multiples slices juntos.
- `fetchAndSetPlayerData()` hace hidracion secuencial de muchos estados.
- `refreshTeamData()` actualiza varias colecciones de equipo.

Efecto neto: pantallas de home/explore/teams/matches/chat pueden rerenderizar por cambios de dominios que no usan.

## 2) Que funciones deberian memorizarse (o estabilizarse mejor)

Aunque hay `useCallback`, varias funciones siguen siendo inestables por dependencias calientes (arrays y objetos que cambian seguido).

Funciones con mayor riesgo de identidad inestable:
- `joinMatchOpportunity`
- `respondToMatchInvitation`
- `finalizeMatchOpportunity`
- `suspendMatchOpportunity`
- `respondToJoinRequest`
- `respondToRivalChallenge`
- `acceptRivalOpportunityWithTeam`
- `getFilteredMatches`
- `getUserTeams`
- `getFilteredUsers`
- `getFilteredTeams`

Accion recomendada:
- Evitar exponer "selectores-funcion" dependientes de arrays volatiles dentro de Context.
- Convertirlos en hooks de dominio (`useMemo` local o `select` de React Query).
- Mantener en Context solo comandos globales de sesion y navegacion transversal.

## 3) Que datos NO deberian estar en Context

No deberian vivir en Context global (alto churn, datos remotos cacheables):
- listados de partidos y derivados,
- participantes por partido,
- equipos y membresias,
- invitaciones/solicitudes/reto rival,
- mensajes/chat y metadatos de conversacion,
- datos de venue owner (reservas, canchas, horarios),
- metricas admin.

Context debe quedarse con:
- estado de autenticacion y usuario actual minimo,
- flags globales de arranque/onboarding,
- intents transversales de navegacion (minimos),
- comandos transversales de sesion (`logout`, refresh de sesion).

## 4) Que deberia vivir exclusivamente en React Query

Debe migrarse a React Query (queries + invalidation declarativa):
- Feed de partidos (`matchOpportunities`) y variaciones por filtro.
- IDs/estado de participacion del usuario.
- Teams del usuario + invites + join requests + rival challenges.
- Participantes de oportunidad y ratings.
- Chat: mensajes, participantes y metadatos de room/inbox.
- Venue owner: courts, availability, reservations, profile operativo.
- Admin metrics y listados de auditoria operativa.

Principio: **todo dato remoto reconsultable y compartido entre pantallas** debe salir de Context y vivir en Query cache.

## 5) Que mutaciones estan mal centralizadas

Patron actual:
- Parte de mutaciones en `AppProvider`.
- Parte de mutaciones ejecutadas directo en pantallas (`createClient().from(...).insert/update/rpc`).

Problemas:
- invalidacion parcial/no uniforme,
- reglas de negocio duplicadas,
- mayor riesgo de estados inconsistentes entre pantallas.

Mutaciones particularmente sensibles para centralizar por dominio:
- crear/unirse/finalizar/suspender partido,
- responder invitaciones/solicitudes/reto rival,
- operaciones de venue (reservas/courts/hours),
- acciones admin de creacion/moderacion,
- operaciones de chat y notificaciones.

## 6) Que partes generan alto acoplamiento

Acoplamientos de mayor riesgo:
- `AppProvider` como dependencia transversal de casi toda la app.
- Pantallas masivas con mezcla UI + negocio + IO:
  - `components/create-match-screen.tsx`
  - `components/teams-screen.tsx`
  - `components/venue-dashboard-screen.tsx`
  - `components/chat-screen.tsx`
  - `components/match-detail-screen.tsx`
- Features wrapper (`src/features/*`) sin desacoplar aun la logica legacy (`components/*`).

Impacto: cualquier cambio de dominio toca multiples capas y aumenta regresiones.

## 7) Que dependencias cruzadas existen

Mapa de dependencias cruzadas actual:
- `auth -> todos los dominios`: bootstrap/gating.
- `matches <-> teams`: desafios rivales, membresias y cupos.
- `matches <-> venues`: reserva y creacion de oportunidad.
- `matches <-> chat`: acceso y contexto de oportunidad.
- `notifications <-> navigation`: push response dispara rutas.
- `telemetry <-> auth/navigation`: eventos etiquetados por usuario/ruta.

Riesgo: cambios locales en un dominio tienen efectos secundarios no obvios en otro.

## 8) Que listeners/subscriptions podrian generar memory leaks

Correctamente gestionado:
- cleanup de `onAuthStateChange` en provider.
- cleanup de listener push en bootstrap.
- cleanup de canal realtime en chat.

Riesgos detectados:
- timers sin cleanup en flows de swipe (posibles updates post-unmount).
- efectos async largos en pantallas grandes sin cancelacion robusta en todos los casos.
- recargas repetitivas por eventos realtime que pueden acumular trabajo si la pantalla esta muy activa.

Accion:
- estandarizar abort/cancel tokens para efectos async,
- limpiar `setTimeout/setInterval`,
- encapsular subscription lifecycle en hooks dedicados.

## 9) Que riesgos existen para navegacion movil

- Gating distribuido entre `app/index.tsx` y `app/(tabs)/_layout.tsx`: puede producir saltos de ruta.
- Estados transitorios de onboarding/deeplink combinados con AsyncStorage y redirects.
- Navegacion por notificaciones push en paralelo al gate inicial puede causar experiencia erratica.
- Dependencia de estado global voluminoso durante bootstrap incrementa ventanas de carrera.

## 10) Que hooks personalizados deberian existir

Base recomendada:
- `useAuthSession()`
- `useOnboardingFlow()`
- `useMatchFeed(filters)`
- `useMatchMutations()`
- `useMatchParticipants(opportunityId)`
- `useTeamHub(userId)`
- `useTeamMutations()`
- `useVenueOwnerDashboard(ownerId)`
- `useVenueMutations()`
- `useMatchChat(opportunityId)`
- `useNotificationsCenter()`
- `usePushRouting()`
- `useTelemetry()`
- `useDeepLinkIntents()`

Cada hook debe exponer:
- `data`, `isLoading`, `error`, `refetch` (queries),
- `mutate`, `isPending`, `onSuccess invalidation` (mutations),
- interfaces tipadas por dominio.

## 11) Como evolucionar hacia arquitectura domain-driven

Modelo objetivo:
- `domains/auth`
- `domains/matches`
- `domains/teams`
- `domains/venues`
- `domains/notifications`
- `domains/chat`
- `domains/telemetry`

Por dominio:
1. `types` de dominio.
2. `repository` (Supabase access).
3. `queries` y `mutations` (React Query).
4. `hooks` de caso de uso.
5. `ui` desacoplada de IO.

`AppProvider` pasa a ser capa fina de sesion y contexto transversal.

## 12) Que dominios deberian separarse primero (orden recomendado)

1. **auth** (bloqueante de bootstrap y navegacion)
2. **matches** (mas volumen y centralidad de producto)
3. **teams** (alto acoplamiento con matches)
4. **chat** (realtime y rendimiento)
5. **venues** (operacion compleja por reservas)
6. **notifications** (navegacion/eventos)
7. **telemetry** (transversal, bajo riesgo funcional)

Justificacion:
- reduce primero el riesgo de render/navegacion y el churn de datos mas frecuente.

## 13) Como reducir complejidad futura

- Regla 1: no agregar datos remotos nuevos a Context global.
- Regla 2: toda mutacion debe vivir en `domain/*/mutations`.
- Regla 3: toda query compartida entre pantallas debe tener `queryKey` canonica.
- Regla 4: pantallas no importan `createClient()` salvo casos excepcionales temporales.
- Regla 5: un dominio no conoce estados internos de otro; se comunica por contratos.
- Regla 6: provider raiz minimo y estable.

Controles de calidad recomendados:
- checklist PR de frontera (Context vs Query vs local state),
- metrica de renders por pantalla critica,
- trazabilidad de invalidaciones tras mutaciones.

## 14) Como preparar la app para escalabilidad movil real

Lineas tecnicas prioritarias:
- migrar listas pesadas a virtualizacion consistente,
- reducir rerender global eliminando datos de alto churn del Context,
- cache incremental con React Query (staleTime, gcTime, invalidation selectiva),
- normalizar realtime por dominio (append/patch, no refetch completo),
- minimizar bootstrap blocking en navegacion inicial,
- mover operaciones transaccionales criticas a RPC backend para concurrencia segura.

---

## Plan tecnico gradual de refactorizacion (sin romper produccion)

## Fase 0 - Hardening y observabilidad (1-2 sprints)

Objetivo:
- medir y contener riesgos sin cambiar contratos publicos.

Cambios:
- instrumentar render count en pantallas criticas.
- envolver `value` de context en `useMemo`.
- auditar deps de callbacks y timers.
- agregar cleanup/cancel en efectos async sensibles.

Riesgo:
- bajo.

Criterios de exito:
- reduccion medible de rerenders en `teams`, `home`, `matches`, `explore`.
- cero warnings de update sobre componente desmontado en flujos criticos.

## Fase 1 - Lecturas a React Query por dominio (2-4 sprints)

Objetivo:
- sacar datos remotos de alto churn del Context.

Cambios:
- implementar queries `matches`, `teams`, `chat`, `venues` con `queryKey` canonicas.
- mantener `useApp()` como facade compatible (leyendo internamente desde hooks/query donde sea posible).
- eliminar refetch manual disperso en pantallas migradas.

Riesgo:
- medio (stale data si keys/invalidaciones incompletas).

Criterios de exito:
- >= 70% de lecturas remotas principales servidas por Query.
- baja significativa de latencia percibida tras mutaciones.

## Fase 2 - Mutaciones por dominio + invalidacion declarativa (2-4 sprints)

Objetivo:
- eliminar mutaciones directas en UI y unificar reglas.

Cambios:
- crear `useMatchMutations`, `useTeamMutations`, `useVenueMutations`, `useChatMutations`, `useNotificationMutations`.
- pantallas consumen solo hooks de dominio.
- invalidaciones estandarizadas por `queryKey`.

Riesgo:
- medio/alto (regresion funcional en casos borde).

Criterios de exito:
- 0 mutaciones directas Supabase en pantallas de dominios migrados.
- errores de consistencia visual reducidos.

## Fase 3 - Reducir AppProvider a minimo global (1-3 sprints)

Objetivo:
- desmantelar provider monolitico sin big-bang.

Cambios:
- retirar del Context: colecciones de matches/teams/chat/venues.
- mantener solo auth/session + intents globales de navegacion.
- deprecar gradualmente funciones legacy de `useApp()`.

Riesgo:
- medio.

Criterios de exito:
- `AppContextType` reducido drasticamente.
- estabilidad de rutas/gates equivalente o mejor a baseline.

## Fase 4 - Endurecimiento para escala movil (continuo)

Objetivo:
- preparar crecimiento real de usuarios y sesiones activas.

Cambios:
- paginacion + virtualizacion obligatoria en feeds/listas.
- realtime incremental (merge local) en lugar de reload completo.
- RPC backend para casos transaccionales de alta concurrencia.
- presupuesto de performance por pantalla (render/ms/memoria).

Criterios de exito:
- mejoras consistentes en tiempo de interaccion y consumo de memoria.
- comportamiento estable bajo carga funcional alta.

---

## Riesgos de implementacion y mitigaciones

- Riesgo: divergencia temporal entre `useApp()` legacy y nuevos hooks.
  - Mitigacion: facade compat + tests de regresion por flujo critico.
- Riesgo: invalidaciones incompletas en Query.
  - Mitigacion: matriz de mutacion->queryKeys obligatoria en PR.
- Riesgo: deuda de archivos gigantes dificulta migracion.
  - Mitigacion: extraer primero data/hooks, luego dividir UI.

---

## Resultado esperado al finalizar roadmap

- Estado global pequeno, estable y mantenible.
- Datos remotos versionados por dominio, no por pantalla.
- Menos rerenders innecesarios y mejor fluidez en mobile.
- Menor acoplamiento entre features y menor riesgo de regresion.
- Base arquitectonica apta para escalar usuarios y realtime de forma controlada.
