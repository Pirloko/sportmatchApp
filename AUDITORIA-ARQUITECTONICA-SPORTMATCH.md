# Auditoria Arquitectonica Completa - SportMatch

Fecha: 2026-05-06  
Alcance: analisis tecnico basado en el codigo real del repositorio `COPIAconExpo` (frontend Expo/React Native + Supabase).  
Metodo: inspeccion de providers, pantallas, capa `lib/supabase`, SQL consolidado (`todaslasmigraciones.sql`), configuracion Expo y dependencias.

---

## 1) Arquitectura real actual del frontend

- App Expo Router con entrypoint en `expo-router/entry` (`package.json`) y rutas en `app/`.
- Composicion root en `app/_layout.tsx`: `ThemeProvider` -> `AppQueryProvider` -> `AppProvider` -> `PushBootstrap` -> `TelemetryBootstrap` -> `Stack`.
- Gate de sesion/onboarding en `app/index.tsx` (`RootGateScreen`) con redireccion por tipo de cuenta (`player`, `venue`, `admin`).
- Navegacion jugador por tabs en `app/(tabs)/_layout.tsx`; persistencia de ultimo tab.
- Arquitectura de features parcial: `src/features/*` existe, pero en varias rutas solo wrappea componentes legacy de `components/*`.
- Estado de dominio centralizado en `lib/app-provider.tsx` (provider monolitico).

Diagnostico: frontend organizado por rutas, pero no por dominio real; gran parte del negocio sigue en componentes y contexto global.

## 2) Arquitectura real actual del backend

- No existe backend server propio en este repo (sin `api` server-side ni edge functions locales visibles).
- Backend real actual: Supabase (Postgres + RLS + RPC + triggers), definido en `todaslasmigraciones.sql`.
- Cliente movil ejecuta la mayor parte de casos de uso directamente contra tablas y algunas RPC.
- Existe backend externo puntual para alta de venues: `lib/supabase/admin-create-venue.ts` (`EXPO_PUBLIC_ADMIN_BACKEND_URL`).

Diagnostico: arquitectura backend "database-centric" con mucha orquestacion en cliente.

## 3) Flujo de datos completo

1. UI monta providers globales en `app/_layout.tsx`.
2. `AppProvider` resuelve sesion Supabase (`getSession`, `onAuthStateChange`) y perfila usuario.
3. Segun rol, hidrata datos (partidos, equipos, venue owner, etc.).
4. Pantallas invocan acciones de `useApp()` o hacen queries directas con `createClient()`.
5. Mutaciones escriben en tablas/RPC y luego fuerzan refetch de listas completas.
6. Realtime se usa de forma clara sobre todo en chat (`components/chat-screen.tsx`), donde `INSERT` en `messages` dispara recarga.
7. UI se rerenderiza a partir de arrays globales del contexto y estados locales de pantalla.

Diagnostico: flujo funcional pero con invalidacion manual, cache distribuida y refrescos granulares inconsistentes.

## 4) Dependencias criticas

- `@supabase/supabase-js`: auth, data, storage, realtime.
- `@react-native-async-storage/async-storage`: persistencia de sesion.
- `@tanstack/react-query`: infraestructura de cache declarada pero uso parcial.
- `expo-router`: estructura de navegacion.
- `expo-notifications`: bootstrap y registro de push.
- `react-native-url-polyfill`: compatibilidad requerida por supabase-js.

Riesgo: acoplamiento operativo alto a Supabase + estabilidad de sesion/push.

## 5) Acoplamientos peligrosos

- **God Provider**: `lib/app-provider.tsx` concentra auth, onboarding, partidos, equipos, reservas, retos, ratings, UI flags.
- **UI acoplada a negocio**: `create-match-screen.tsx`, `teams-screen.tsx`, `venue-dashboard-screen.tsx`, `chat-screen.tsx`.
- **Doble patron de acceso a datos**: uso mixto de `useApp()` y llamadas directas `createClient()` desde pantallas.
- **Features a medio migrar**: wrappers en `src/features/*` que reexportan componentes legacy.

Impacto: cambios de dominio terminan propagandose en cascada por muchas pantallas.

## 6) Posibles cuellos de botella

- Refetch recurrente de conjuntos amplios tras mutaciones (especialmente partidos/equipos).
- Lecturas costosas con recomputo de agregados en cliente (`players_joined`, participantes, etc.).
- Chat con recarga completa de mensajes/participantes ante cada `INSERT` realtime.
- Queries admin cargadas desde cliente con volumen relevante.

Impacto: mayor latencia percibida y uso de red/CPU creciente con el volumen.

## 7) Problemas de escalabilidad

- Estrategia principal "write -> refetch listas completas" escala peor que invalidacion selectiva.
- Estado global grande provoca rerenders amplios ante cambios no relacionados.
- Ausencia de fronteras por dominio dificulta escalar equipo de desarrollo.
- Realtime no aplicado de forma uniforme (chat si; otros dominios no).

## 8) Riesgos de mantenimiento

- Archivos de gran tamano y alta complejidad:
  - `components/create-match-screen.tsx` (~3053 lineas)
  - `lib/app-provider.tsx` (~2230)
  - `components/teams-screen.tsx` (~1900)
- Alta mezcla de responsabilidades (presentacion + reglas + IO).
- Baja testabilidad por dependencia directa de supabase en UI/provider.
- Coste de onboarding tecnico elevado para nuevos devs.

## 9) Riesgos para crecimiento a 10.000 usuarios

- Mayor presion sobre PostgREST por recargas completas y queries repetidas.
- Triggers de notificaciones por mensaje pueden amplificar escrituras.
- Logica transaccional parcial en cliente incrementa riesgo de inconsistencias bajo concurrencia.
- Paneles con agregacion en cliente no escalan igual que RPC agregadas/materializadas.

Nivel de riesgo: alto si no se migra a operaciones atomicas server-side.

## 10) Riesgos para crecimiento realtime

- Solo chat muestra uso realtime robusto; otros cambios dependen de polling/refetch.
- Modelo de "evento -> recarga total" no optimiza throughput.
- Si crecen chats activos, fan-out de notificaciones + reload de historiales aumentara costos.
- Falta estrategia estandar de reconciliacion incremental (append/patch local).

## 11) Riesgos mobile especificos

- Uso intensivo de `ScrollView` + `.map` en pantallas extensas (sin virtualizacion sistematica).
- Riesgo de jank en dispositivos gama media/baja por render de listas grandes.
- Muchos handlers inline en listas incrementan trabajo de reconciliacion.
- Flujos largos en una sola pantalla elevan consumo de memoria y complejidad de navegacion.

## 12) Riesgos Expo especificos

- Push remoto en Expo Go Android tiene limitaciones reconocidas en codigo (`lib/push/register-device.ts`).
- OAuth/deep linking sensible a configuracion de redirect URL (riesgo de login roto si desalineado).
- `newArchEnabled: true` en `app.json` eleva superficie de compatibilidad de librerias.

## 13) Riesgos Supabase especificos

- Desalineacion potencial entre schema y registro push movil:
  - codigo intenta `mobile_push_subscriptions` y fallback `push_subscriptions`,
  - SQL consolidado define `push_subscriptions` orientada a WebPush.
- Politicas RLS amplias en ciertas lecturas (segun tablas/policies definidas).
- Casos de uso criticos aun no encapsulados totalmente en RPC transaccionales.
- Dependencia de `SECURITY DEFINER`/triggers: requiere gobernanza estricta para evolucion segura.

## 14) Riesgos React Query + Context hibrido

- `QueryClientProvider` activo, pero dominio principal se maneja fuera de React Query.
- Doble fuente de verdad: cache query vs arrays en contexto.
- Invalidacion no centralizada; riesgo de data stale por omision de refetch puntual.
- Complejidad mental alta para mantener coherencia en mutaciones.

Diagnostico: hibrido incompleto, mas cercano a Context-heavy con React Query marginal.

## 15) Problemas potenciales de memoria/renderizado

- Re-render global por `value` de contexto grande y no memoizado en `AppProvider`.
- Pantallas gigantes con muchos subestados y efectos aumentan churn de renders.
- Chat y listas pueden crecer en memoria por cargas completas repetidas.
- Falta de virtualizacion en vistas con colecciones extensas.

Prioridad tecnica: alta.

## 16) Que modulos deberian separarse primero

1. `lib/app-provider.tsx` -> separar en providers/stores por dominio.
2. `components/create-match-screen.tsx` -> dividir por flujo (`open`, `rival`, `team_pick`, `reserva`).
3. `components/teams-screen.tsx` -> separar CRUD, invites, join-requests, rival challenges.
4. `components/chat-screen.tsx` -> extraer datos/realtime a modulo dedicado.
5. `components/venue-dashboard-screen.tsx` -> aislar reservas, canchas, horarios, perfil.

## 17) Que partes deberian migrarse a arquitectura basada en dominio

- Dominio `auth`: sesion, login, refresh, perfil base, onboarding.
- Dominio `matches`: crear/unirse/finalizar/suspender, participantes, reglas de cupo.
- Dominio `teams`: membresias, invitaciones, solicitudes, retos.
- Dominio `venues`: slots, reservas, configuracion de centro.
- Dominio `chat`: mensajes, participantes, inbox, notificaciones derivadas.
- Dominio `admin`: metricas, moderacion, operaciones privilegiadas.

Objetivo: separar "reglas + repositorios + contratos" de la capa de presentacion.

## 18) Que partes deberian convertirse en hooks especializados

- `useAuthSession()`
- `useCurrentProfile()`
- `useMatchList()` / `useMatchFilters()`
- `useJoinMatchMutation()` / `useCreateMatchMutation()`
- `useMatchParticipants(opportunityId)`
- `useMatchChat(opportunityId)` (query + realtime + envio)
- `useTeams()`, `useTeamInvites()`, `useTeamJoinRequests()`
- `useVenueAvailability(venueId, dateRange)`
- `useVenueReservations(venueId, range)`

## 19) Que logica deberia salir de AppProvider

- Hidratacion/gate de auth y estado de sesion a provider dedicado de identidad.
- Orquestacion de partidos a un modulo `matches` con comandos/query separados.
- Operaciones de equipos/retos a modulo `teams`.
- Operaciones de venue/admin a modulos independientes por rol.
- Flags de UI (focus team, onboarding source, persist nav) a estado de aplicacion no-dominio.

Resultado esperado: contexto raiz pequeno, estable y de baja frecuencia de cambio.

## 20) Que logica deberia moverse definitivamente al backend/RPC

Prioridad alta (inmediata):
- Crear partido completo (incluyendo reserva opcional) en una sola RPC atomica.
- Join a partidos (especialmente open/team-pick) con chequeos de cupo/concurrencia server-side.
- Operaciones de admin/metricas como RPC agregadas (evitar computo pesado en cliente).
- Fan-out/control de notificaciones con limites claros y observabilidad.

Prioridad media:
- Endpoints/RPC para inbox de chat y vistas agregadas (ultimo mensaje, unread count).
- Consolidar telemetria/push en contratos backend estables (evitar drift de schema).

---

## Conclusiones ejecutivas

- La app esta en una fase funcional avanzada, pero con deuda arquitectonica significativa en estado global y separacion de dominios.
- El mayor riesgo tecnico para escalar no es UI visual, sino la combinacion de:
  - logica de negocio distribuida en cliente,
  - refetch completos recurrentes,
  - y acoplamiento fuerte al `AppProvider`.
- Para soportar 10k usuarios y mayor realtime sin degradacion, la prioridad es:
  1) reducir el provider monolitico,
  2) mover casos de uso criticos a RPC atomicas,
  3) estandarizar estrategia de cache/invalidation (React Query por dominio).
