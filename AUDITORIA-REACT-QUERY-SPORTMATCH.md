# Auditoria Profunda de TanStack React Query - SportMatch

Fecha: 2026-05-06  
Alcance: analisis tecnico de toda la implementacion actual de React Query y su interaccion con Context/AppProvider.  
Base: codigo real del proyecto (`app`, `components`, `src/features`, `lib`).

---

## Resumen ejecutivo

La implementacion actual de TanStack React Query esta **habilitada pero subutilizada**:
- existe `QueryClientProvider`,
- existe una query funcional (`public-venues`),
- pero el resto del estado remoto critico sigue en Context + fetch manual + refetch completo.

Resultado: arquitectura hibrida con alto riesgo de inconsistencia, sobreconsumo de red y degradacion de performance movil.

---

## 0) Inventario real de React Query en el proyecto

Uso detectado:
- `src/app/providers/query-provider.tsx` (`QueryClientProvider` con `staleTime` base).
- `app/_layout.tsx` (provider montado globalmente).
- `src/features/explore/hooks/use-public-venues.ts` (`useQuery` con key `['public-venues']`).

No detectado en uso real:
- `useMutation`
- `invalidateQueries`
- `setQueryData`
- `prefetchQuery`
- hydration/dehydration
- persistencia de cache offline.

Diagnostico: React Query aun no es la capa principal de datos.

## 1) Queries duplicadas

### Caso concreto: venues publicos
- Query React Query:
  - `src/features/explore/hooks/use-public-venues.ts`
- Fetch manual paralelo:
  - `components/create-match-screen.tsx` (efectos/cargas directas de venues)

Riesgo:
- doble fuente de verdad,
- estados visuales divergentes entre pantallas,
- trafico duplicado.

### Caso estructural: reservas/canchas
- Funciones de owner queries ya combinan lecturas,
- pero pantallas repiten lecturas en secuencia (canchas + reservas) en distintos puntos.

Riesgo:
- redundancia de consultas en un mismo flujo.

## 2) Invalidaciones innecesarias

Problema principal:
- No hay invalidacion fina de query cache; predomina refetch masivo post-mutacion.
- En `AppProvider` varias acciones recalculan listados completos (`refreshMatchData`, `refreshTeamData`) aunque cambie solo una entidad.

Impacto:
- costo de red alto,
- latencia mayor,
- renders amplios no necesarios.

## 3) Riesgos de stale data

- Datos remotos criticos viven fuera de Query cache (en Context o estado local de pantalla).
- Diferentes pantallas cargan mismos recursos por caminos distintos (query vs manual).
- Sin invalidacion declarativa por `queryKey`, la frescura depende de efectos manuales.

Ejemplos:
- `matches`, `teams`, `chat`, `venues owner`, `admin metrics` no tienen cache query estandarizada.

## 4) Riesgos de race conditions

Patron observado en varios flujos:
- read -> validar en cliente -> write
- sin arbitraje universal server-side para todos los casos.

Ejemplo:
- flujo de join a partido con chequeo previo de cupo/participacion desde cliente antes de insertar.

Riesgo:
- dos usuarios concurrentes pueden pasar validaciones locales y competir por el mismo cupo.

## 5) Problemas de optimistic updates

Estado actual:
- no hay estrategia formal de optimistic UI con `useMutation` (`onMutate`, rollback, reconciliation).

Consecuencia:
- UX menos responsiva,
- dependencia de refetch para reflejar cambios,
- sin control de rollback transaccional en cache.

## 6) Problemas de sincronizacion con Context

Riesgo critico de arquitectura:
- Query cache y Context coexisten sin contrato claro de "source of truth".
- Context concentra datos remotos de alto churn.
- Query se usa marginalmente en un subconjunto de pantallas.

Resultado:
- inconsistencias temporales entre vistas,
- duplicacion de responsabilidades,
- complejidad cognitiva alta para mantener coherencia.

## 7) Riesgos realtime + query cache

Caso chat actual:
- realtime escucha `INSERT` de mensajes,
- cada evento fuerza recarga completa de mensajes y participantes.

Riesgo:
- con alta actividad, tormenta de refetch + red + render.

Modelo recomendado:
- `setQueryData` incremental por evento realtime,
- deduplicacion por `message.id`,
- fallback a refetch solo ante divergencia detectable.

## 8) Problemas de cache hydration

No se observa:
- hydration inicial de cache,
- persistencia de query cache en storage local,
- politica offline-first para datasets clave.

Riesgo movil:
- cada arranque o retorno puede requerir red,
- peor experiencia en conectividad intermitente.

## 9) Queries demasiado grandes

Patrones detectados:
- lecturas amplias de partidos con joins/derivaciones en cliente.
- cargas de equipos + miembros + perfiles en bloque.
- metricas admin agregadas en cliente con datasets voluminosos.

Problema:
- payloads grandes,
- procesamiento en JS,
- mayor coste CPU/memoria en dispositivos moviles.

## 10) Queries que deberian fragmentarse

Fragmentar por caso de uso:
- `matches:list` separado de `matches:detail` y `matches:participants`.
- `teams:mine` separado de `teams:invites` y `teams:joinRequests`.
- `chat:messages` separado de `chat:participants`.
- `venues:public` separado de `venues:owner` y `venues:reservationsRange`.
- `admin:metrics` separado por rango/modulo.

Beneficio:
- invalidacion precisa,
- menor transferencia,
- mejor UX por carga progresiva.

## 11) Estrategias de prefetching faltantes

No hay `prefetchQuery` activo.

Prefetch recomendado:
- al abrir card de partido: precargar `matches:detail` + `participants`.
- antes de entrar a chat: precargar ultimos mensajes.
- en transicion a equipo detalle: precargar team detail + invites/joinRequests relevantes.
- en tabs de venue owner: precargar corte de reservas/courts.

## 12) Riesgos de consumo excesivo de red

- refetch completos post-mutacion en provider.
- recargas duplicadas por realtime + envio de mensaje.
- fetch manual repetido en pantallas que comparten datasets.
- ausencia de invalidacion selectiva por key.

Impacto:
- bateria, datos moviles, latencia.

## 13) Riesgos moviles de performance

- demasiadas recargas integrales de datos.
- procesamiento de agregados en cliente.
- rerenders amplios por contexto monolitico + actualizaciones frecuentes.
- ausencia de cache persistente para amortiguar red.

Resultado:
- jank y menor fluidez en dispositivos gama media/baja.

## 14) Que queries deberian persistirse offline

### Alta prioridad (persistir)
- `['matches','list',filters]`
- `['matches','detail',matchId]` (ultimos vistos)
- `['teams','mine',userId]`
- `['teams','invites',userId]`
- `['venues','public']`
- `['chat','messages',matchId]` (ultimas conversaciones)

### Prioridad media (persistir con TTL corto)
- `['matches','participants',matchId]`
- `['venues','owner',ownerId]`
- `['venues','courts',venueId]`

### Baja prioridad / no persistir largo
- `['admin','metrics',range]`
- disponibilidad altamente volatile de reservas (usar TTL muy corto).

## 15) Arquitectura recomendada (realtime, cache, optimistic UI, invalidacion)

## A) Realtime
- Suscripciones por dominio, no embebidas en pantallas grandes.
- En evento realtime:
  - actualizar cache con `queryClient.setQueryData` (merge incremental),
  - invalidar selectivamente solo si el evento no puede reconciliarse localmente.
- Evitar estrategia "evento -> recarga completa".

## B) Cache
- Definir taxonomia de `queryKeys` oficial por dominio.
- Usar `staleTime` y `gcTime` por criticidad de dato.
- Activar persistencia de cache para datasets de lectura frecuente movil.
- Centralizar repositorios de datos y evitar fetch ad hoc en UI.

## C) Optimistic UI
- Introducir `useMutation` por dominio con:
  - `onMutate` (snapshot + parche optimista),
  - `onError` rollback,
  - `onSuccess` reconciliation fina,
  - `onSettled` invalidacion minima necesaria.
- Aplicar primero en:
  - join/leave partido,
  - respuesta a invitaciones,
  - envio de mensaje chat,
  - acciones de equipo de baja criticidad transaccional.

## D) Invalidacion inteligente
- Invalidar por entidad afectada y relaciones directas, no por modulo completo.
- Ejemplo de reglas:
  - join partido -> invalidar `matches:detail:id`, `matches:participants:id`, `matches:participatingIds:user`.
  - responder invitacion equipo -> invalidar `teams:invites:user`, `teams:mine:user`.
  - nuevo mensaje -> patch `chat:messages:id` y opcional invalidar `chat:lastByOpp:user`.

---

## Query keys recomendadas para SportMatch

- `['auth','profile',userId]`
- `['matches','list',{ gender, city, status }]`
- `['matches','detail',matchId]`
- `['matches','participants',matchId]`
- `['matches','participatingIds',userId]`
- `['teams','mine',userId]`
- `['teams','invites',userId]`
- `['teams','joinRequests',userId]`
- `['teams','detail',teamId]`
- `['chat','messages',matchId]`
- `['chat','participants',matchId]`
- `['venues','public']`
- `['venues','owner',ownerId]`
- `['venues','courts',venueId]`
- `['venues','reservations',venueId,fromIso,toIso]`
- `['admin','metrics',range]`

---

## Plan gradual de adopcion (sin romper produccion)

## Fase 1 - Estandarizar lectura (bajo riesgo)
- Migrar `matches`, `teams`, `chat read`, `venues` a `useQuery`.
- Mantener `useApp()` como facade temporal.
- Medir consumo de red y render antes/despues.

## Fase 2 - Mutaciones con invalidacion selectiva
- Introducir `useMutation` por dominio.
- Reemplazar refetch global por invalidaciones dirigidas.
- Eliminar mutaciones directas en pantallas.

## Fase 3 - Realtime incremental + cache persistente
- Pasar chat y eventos clave a `setQueryData`.
- Activar persistencia offline selectiva de query cache.
- Definir politicas de TTL por tipo de dato.

## Fase 4 - Retiro de estado remoto del Context
- `AppProvider` queda para auth/sesion/intents globales.
- Datos remotos compartidos quedan exclusivamente en React Query.

---

## Conclusiones

- El principal problema actual no es una mala configuracion de React Query, sino su adopcion parcial.
- El mayor retorno tecnico inmediato esta en:
  1) unificar datasets remotos en query cache,
  2) invalidar por entidad y no por refresco global,
  3) tratar realtime como patch incremental,
  4) persistir offline solo lo que aporta valor movil real.
