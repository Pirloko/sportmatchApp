# Documentacion Completa del Ecosistema SportMatch

## 1) Nombre del proyecto

- **Nombre comercial:** `SportMatch`
- **Nombre tecnico (package):** `copiaconexpo`
- **Tipo de producto:** aplicacion movil multiplataforma (iOS, Android, Web) para organizar partidos de futbol, equipos, centros deportivos y comunidad.

## 2) Objetivo del proyecto

SportMatch busca resolver la coordinacion de "pichangas" y partidos amateurs en un solo flujo:

- Descubrir partidos y jugadores.
- Crear partidos con distintos modos (rival, abierto/revuelta, busqueda de jugadores, team pick).
- Administrar equipos (capitanes, invitaciones, solicitudes).
- Gestionar centros/canchas y reservas.
- Coordinar por chat y notificaciones.
- Mantener trazabilidad con telemetria y reglas de negocio en base de datos (Supabase + RLS + RPC).

Adicionalmente, este proyecto forma parte de un ecosistema con **dos clientes principales**:

- app movil (este repo, Expo/React Native),
- app web SportMatch (React),

ambos conectados a la **misma base de datos en Supabase**.

## 3) Propuesta de valor

- Reduce friccion para armar partidos (organizacion, confirmaciones, cupos).
- Estandariza roles (jugador, venue, admin) y permisos.
- Centraliza informacion de partidos, equipos y mensajes.
- Permite escalar con reglas server-side en BD (RPC/constraints/triggers).

## 4) Posibles modelos de negocio

### 4.1 Freemium B2C (jugadores/equipos)

- Cuenta gratuita con limites (cantidad de partidos creados por mes, funciones de visibilidad, etc.).
- Suscripcion premium para:
  - mayor exposicion de partidos/equipos,
  - estadisticas avanzadas,
  - personalizacion de perfil/equipo,
  - gestion avanzada de invitaciones.

### 4.2 B2B para centros deportivos (venue SaaS)

- Suscripcion mensual por centro para:
  - agenda de canchas,
  - reservas y confirmaciones,
  - panel operativo.
- Modelo por sucursal/cancha (pricing por capacidad).

### 4.3 Comision por reserva/transaccion

- Fee por reserva confirmada de cancha.
- Posible integracion con pagos para capturar comision en cada cobro.

### 4.4 Publicidad y promociones locales

- Promociones de centros, torneos, marcas deportivas.
- Espacios patrocinados en feed de explorar/home.

### 4.5 White-label / licenciamiento

- Version personalizada para ligas, municipalidades o academias.
- Licencia por organizacion con branding y reglas especificas.

## 5) Stack tecnologico actual

## Frontend App movil (este repositorio)

- `React Native` + `Expo` (SDK 54)
- `expo-router` para navegacion por archivos
- `TypeScript`
- `react-native-web` + `react-dom` para salida web
- `@expo/vector-icons`, `react-native-safe-area-context`, `react-native-screens`

## Estado / datos

- Context global con `AppProvider` (`lib/app-provider.tsx`)
- `@tanstack/react-query` (provider presente en root layout)
- Persistencia local con `@react-native-async-storage/async-storage`

## Backend / plataforma de datos

- `Supabase` (`@supabase/supabase-js`)
  - Auth
  - Postgres (tablas + RLS + RPC)
  - Storage (avatars y logos)
  - Realtime (segun configuracion)

## Integraciones de Expo

- `expo-notifications` (push y respuesta a notificaciones)
- `expo-device` (metadata del dispositivo)
- `expo-image-picker` (fotos perfil/logo)
- `expo-linking` y `expo-web-browser` (auth/deep link)
- `expo-clipboard` (utilidades UI)

## Frontend Web SportMatch (proyecto relacionado)

- `React` (SPA web)
- Consume la misma instancia de `Supabase` para auth, datos y reglas de negocio.
- Comparte contrato de datos (tablas, RLS, RPC, Storage) con la app movil.

## Convergencia entre web y movil

- **Auth unificada:** ambos clientes autentican contra el mismo `auth.users`.
- **Dominio compartido:** perfiles, partidos, equipos, chats y notificaciones viven en la misma BD.
- **Reglas centralizadas:** restricciones de negocio se ejecutan en SQL/RPC, no solo en UI.
- **Impacto directo cruzado:** un cambio de esquema/regla afecta inmediatamente a web y movil.

## 6) Configuracion principal del proyecto

Archivo clave: `app.json`

- Nombre app: `SportMatch`
- `slug`: `sportmatch`
- `scheme`: `sportmatch` (deep links)
- bundle/package:
  - iOS: `com.pichanga.expo`
  - Android: `com.pichanga.expo`
- Plugins:
  - `expo-router`
  - `expo-notifications`
  - `expo-image-picker`

Scripts principales (`package.json`):

- `npm run start`
- `npm run android`
- `npm run ios`
- `npm run web`

## 7) Arquitectura funcional (alto nivel)

## Entry y bootstrap

- `app/_layout.tsx` monta:
  - `ThemeProvider`
  - `AppQueryProvider`
  - `AppProvider`
  - `PushBootstrap`
  - `TelemetryBootstrap`
- `app/index.tsx` funciona como "gate":
  - valida configuracion Supabase,
  - decide auth/onboarding,
  - redirige por tipo de cuenta (`player`, `venue`, `admin`).

## Navegacion principal jugador (tabs)

- `home`
- `explorar`
- `partidos`
- `crear`
- `equipos`
- `perfil`

Rutas destacadas adicionales:

- `app/swipe.tsx`
- `app/admin.tsx`
- `app/mi-centro.tsx`
- `app/centro/[venueId].tsx`
- `app/equipo/[teamId].tsx`
- detalle/chat de partidos:
  - `app/(tabs)/partidos/[id].tsx`
  - `app/(tabs)/partidos/chat/[id].tsx`

## 8) Base de datos (Supabase/Postgres)

La base de datos es **compartida entre la app movil y la app web de SportMatch**.

## Tablas principales (dominio)

- `profiles`
- `match_opportunities`
- `match_opportunity_participants`
- `messages`
- `teams`
- `team_members`
- `team_invites`
- `team_join_requests`
- `team_private_settings`
- `rival_challenges`
- `match_opportunity_ratings`
- `sports_venues`
- `venue_courts`
- `venue_weekly_hours`
- `venue_reservations`
- `geo_countries`, `geo_regions`, `geo_cities`
- `notifications`
- `revuelta_external_join_requests`
- `player_reports`

## Tablas de soporte tecnico

- Push: `mobile_push_subscriptions` (fallback `push_subscriptions`)
- Telemetria: `app_events` (fallback `telemetry_events`)
- Crashes: `app_crash_logs` (fallback `telemetry_crashes`)

## Storage buckets

- `profile-avatars` (foto de usuario)
- `team-logos` (logo de equipo)

## Enums/tipos de negocio relevantes

- `Gender`: `male | female`
- `Position`: `portero | defensa | mediocampista | delantero`
- `Level`: `principiante | intermedio | avanzado | competitivo`
- `MatchType`:
  - `rival`
  - `players`
  - `open`
  - `team_pick_public`
  - `team_pick_private`
  - `team_pick` (compatibilidad legacy)
- `MatchStatus`: `pending | confirmed | completed | cancelled`
- `AccountType`: `player | venue | admin`

## 9) Variables de entorno importantes

Definidas/consumidas en cliente Supabase (`lib/supabase/client.ts`):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- fallback compatible:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Notas:

- Se valida URL HTTP/HTTPS.
- Se normaliza el formato de URL (incluyendo casos sin protocolo).
- Si falta configuracion, la app bloquea flujos de auth/datos.
- El uso de `NEXT_PUBLIC_*` como fallback facilita compatibilidad con la app web React.

## 10) Flujos principales del sistema

## 10.1 Auth y sesion

1. Usuario entra en `app/index.tsx`.
2. Si no esta autenticado, se muestra `AuthScreen`.
3. `AppProvider.login(...)` usa:
   - `supabase.auth.signUp` o
   - `supabase.auth.signInWithPassword`
4. Se obtiene/sincroniza perfil (`profiles`).
5. Se decide onboarding segun estado de perfil y tipo de cuenta.

Tambien existe flujo social: `loginWithGoogle`.

## 10.2 Onboarding jugador y venue

- Jugador: `OnboardingScreen` -> `completeOnboarding(...)`
- Venue owner: `VenueOnboardingScreen` -> `completeVenueOnboarding(...)`
- Validacion central en `AppProvider`:
  - `needsOnboarding`
  - `needsVenueOnboarding`

## 10.3 Exploracion y union a partidos

- Pantalla: `ExploreScreen`
- Se listan oportunidades (`match_opportunities`) y se filtran por tipo/genero/estado.
- Al unirse:
  - flujo normal: insercion en `match_opportunity_participants`
  - team pick: RPC `join_team_pick_match_opportunity`
  - open/players: reglas de cupos y arquero/jugador.

## 10.4 Creacion de partidos

Pantalla: `CreateMatchScreen` con varios modos:

- Rival
- Buscar jugadores (`players`)
- Revuelta (`open`)
- Team pick (publico/privado con codigo)
- Solo reserva de cancha

Mutaciones clave:

- `addMatchOpportunity(...)`
- `createTeamPickMatchOpportunity(...)`
- `reserveVenueOnly(...)`

RPC asociadas (segun flujo):

- `create_match_opportunity_with_optional_reservation`
- `create_team_pick_match_opportunity`
- `book_venue_slot`

## 10.5 Equipos

Pantalla: `TeamsScreen`

Flujos:

- Crear/editar/eliminar equipo
- Invitar jugadores
- Solicitar ingreso
- Aceptar/rechazar invitaciones y solicitudes
- Configuracion privada del equipo (`team_private_settings`)

Funciones del contexto:

- `createTeam`, `updateTeam`, `deleteTeam`, `leaveTeam`
- `inviteToTeam`, `respondToInvite`
- `requestToJoinTeam`, `respondToJoinRequest`, `cancelJoinRequest`

## 10.6 Chat y notificaciones

- Chat por oportunidad en `messages`.
- Notificaciones in-app en `notifications`.
- Push bootstrap:
  - registra token del dispositivo,
  - guarda suscripcion,
  - resuelve deep links al abrir notificacion.

## 10.7 Cierre y resultado de partidos

Funciones en contexto:

- `finalizeMatchOpportunity(...)`
- `suspendMatchOpportunity(...)`
- `submitMatchRating(...)`

Se soportan desenlaces:

- Rival (gana creador/rival/empate)
- Casual/revuelta
- Scored casual en ciertos modos

## 11) RPC y funciones importantes de BD (resumen)

Algunas RPC utilizadas por los flujos:

- `join_match_opportunity`
- `join_team_pick_match_opportunity`
- `create_match_opportunity_with_optional_reservation`
- `create_team_pick_match_opportunity`
- `book_venue_slot`
- `leave_match_opportunity_with_reason`
- `cancel_match_opportunity_with_reason`
- `reschedule_match_opportunity_with_reason`
- `mark_all_notifications_read`
- `create_team_with_captain`
- `create_rival_challenge`
- `respond_rival_challenge`
- `accept_team_invite`
- `respond_team_join_request`
- `finalize_rival_match`
- `finalize_revuelta_match`

## 12) Variables/constantes clave del cliente

## Claves de storage local (`lib/storage-keys.ts`)

- `JOIN_TEAM_STORAGE_KEY`
- `JOIN_REGISTER_STORAGE_KEY`
- `JOIN_MATCH_STORAGE_KEY`
- `OPEN_CREATE_AFTER_AUTH_KEY`
- `CREATE_PREFILL_STORAGE_KEY`
- `PLAYER_LAST_NAV_STORAGE_KEY`
- `RIVAL_TARGET_TEAM_STORAGE_KEY`
- `PENDING_TEAM_FOCUS_STORAGE_KEY`

## Otras constantes tecnicas

- `storageKey` de sesion Supabase: `pichanga-auth`
- Rutas push resueltas por tipo:
  - chat -> `/partidos/chat/:id`
  - invitacion -> `/partidos?tab=invitaciones`
  - finalizado -> `/partidos/:id`

## 13) Modulos tecnicos clave (mapa de archivos)

- `lib/app-provider.tsx` -> estado global y casos de uso de negocio.
- `lib/supabase/client.ts` -> cliente Supabase y validacion de entorno.
- `lib/supabase/queries.ts` -> perfiles y oportunidades de partido.
- `lib/supabase/team-queries.ts` -> equipos/invitaciones/solicitudes.
- `lib/supabase/join-match-opportunity.ts` -> reglas de union a partidos.
- `lib/push/register-device.ts` -> token push y registro en BD.
- `lib/push/bootstrap.tsx` -> inicializacion de push + deep links.
- `lib/telemetry/client.ts` -> eventos y errores de app.
- `components/*` -> UI principal por dominio (auth, crear, explorar, equipos, partidos).
- `app/*` -> routing declarativo con `expo-router`.

## 14) Riesgos/consideraciones tecnicas

- Las reglas criticas de negocio viven en SQL/RPC/RLS: cualquier cambio debe coordinarse entre app y migraciones.
- No exponer claves de privilegio (`service_role`) en cliente movil.
- Push nativo depende de build adecuado (en Expo Go Android hay limitaciones).
- Team pick privado depende de codigo y validaciones en backend.
- Al compartir BD con web, cualquier cambio no retrocompatible puede romper ambos frontends.

## 15) Recomendaciones para evolucion del proyecto

- Mantener una sola fuente de verdad de contrato de datos (migraciones + docs versionadas).
- Separar documentacion funcional y tecnica por modulo para facilitar onboarding de nuevos devs.
- Definir KPIs de producto (retencion, conversion a partido completado, fill rate de cupos).
- Formalizar roadmap comercial por segmento (`player`, `team captain`, `venue owner`).
- Acordar un proceso de versionado de contrato (DB changelog) para coordinar releases web + movil.

---

Documento generado desde el estado actual del codigo en este repositorio Expo/Supabase.
