# Contrato compartido: Supabase, API y entorno (web Next.js + React Native)

Este documento sirve para que **otra app (por ejemplo React Native)** use la **misma instancia de Supabase** que este proyecto web, sin adivinar nombres de tablas, RPC, políticas RLS ni rutas auxiliares del servidor.

---

## ¿Tiene sentido lo que pediste?

**Sí.** Para un clon móvil con la misma base de datos necesitas sobre todo:

- **Esquema de datos** (tablas, enums, columnas relevantes y reglas de negocio que viven en SQL).
- **RPC y funciones** expuestas a PostgREST (`supabase.rpc(...)`) con sus parámetros documentados en las migraciones.
- **Variables de entorno** mínimas para el cliente (`NEXT_PUBLIC_*` en web equivalen a constantes en RN).
- **Qué hace el servidor Next** que **no** puedes replicar igual en RN (rutas `/api/*`, cron, service role): ahí decides si RN llama a Supabase directo o expones un backend propio.

**No es práctico** mantener aquí “cada variable de React/Next del frontend”: miles de nombres locales no definen el contrato con Supabase. Lo que importa para RN es el **contrato de datos + auth + RPC + storage + realtime** y, si aplica, las **URLs y secretos** de APIs propias.

---

## Variables de entorno (referencia)

Definidas en `.env.example` y usadas en código:

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase (cliente y servidor). En RN: misma URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima (cliente con RLS). En RN: misma clave con `@supabase/supabase-js`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor (Next, cron, páginas que bypass RLS). **No** en RN ni en binarios públicos. |
| `NEXT_PUBLIC_SITE_URL` | Origen público de la app (OAuth, enlaces). En RN suele ser deep link o esquema `myapp://`. |
| `NEXT_PUBLIC_APP_TIMEZONE` | IANA, ej. `America/Santiago` (formato de fechas en UI). |
| `NEXT_PUBLIC_GA_ID` | Analytics web (opcional en RN). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | Web Push en navegador. En RN normalmente **FCM/APNs**, no estas mismas claves. |
| `PUSH_SEND_SECRET` | Protege `POST /api/push/send`. |
| `NOTIFICATIONS_CRON_SECRET` | Protege crons `POST /api/cron/notifications/*`. |
| `SENTRY_DSN` | Opcional (errores servidor). |

---

## Storage (buckets usados en código)

| Bucket | Constante en código | Convención de ruta |
|--------|---------------------|-------------------|
| `profile-avatars` | `PROFILE_AVATARS_BUCKET` en `lib/supabase/profile-photo.ts` | `{userId}/avatar` |
| `team-logos` | `TEAM_LOGOS_BUCKET` en `lib/supabase/team-logos.ts` | `{teamId}/logo` |

---

## Realtime (canales usados en la web; RN puede replicar el patrón)

Prefijos / nombres observados en el código:

- `messages:{opportunityId}` — chat por oportunidad.
- `match-opportunity-participants:{opportunityId}` — cambios de roster.
- `app-rt:{userId}:match` | `team` | `users` — agregación en `lib/core/realtime-manager.ts`.

La configuración exacta de publicación (qué tablas emiten eventos) está en migraciones y en el dashboard de Supabase.

---

## Enums PostgreSQL relevantes (alineados con `lib/types.ts` donde aplica)

- `gender`: `male`, `female`
- `position`: `portero`, `defensa`, `mediocampista`, `delantero`
- `skill_level`: `principiante`, `intermedio`, `avanzado`, `competitivo`
- `match_type` (evolución por migraciones): además de `rival`, `players`, `open`, existen **`team_pick_public`** y **`team_pick_private`** (selección de equipos 6vs6).
- `match_status`: `pending`, `confirmed`, `completed`, `cancelled`
- `participant_status`: `pending`, `confirmed`, `cancelled`, **`invited`** (añadido en migración; invitaciones a partido).
- `team_member_status`, `invite_status`, `account_type` (`player` | `venue`), `player_report_status`, etc.

Si el enum en la BD y los literales en TypeScript divergen, **manda la base de datos** tras aplicar todas las migraciones.

---

## Tablas `public.*` creadas en migraciones (catálogo)

La **lista de columnas completa y al día** está en `supabase/migrations/` (orden cronológico). Aquí el inventario de tablas para orientación en RN:

| Tabla | Notas breves |
|-------|----------------|
| `profiles` | Perfil jugador/dueño cancha; muchas columnas añadidas (stats, moderación, `city_id`, `whatsapp`, `birth_date`, `last_seen_at`, `account_type`, etc.). |
| `match_opportunities` | Núcleo de listados/partidos; columnas de revuelta, rival, reserva de cancha, geo, resultados, `join_code`, `team_pick_color_a/b`, etc. |
| `match_opportunity_participants` | `(opportunity_id, user_id)` PK; `status`; `is_goalkeeper`; team pick: `pick_team` (`A`/`B`), `encounter_lineup_role` (`gk`, defensa, etc.). |
| `matches`, `match_participants` | Instancia de partido confirmado (flujos que la usen). |
| `messages` | Chat ligado a `opportunity_id`. |
| `teams`, `team_members`, `team_invites`, `team_join_requests`, `team_private_settings` | Equipos e invitaciones. |
| `rival_challenges` | Desafíos rival entre equipos. |
| `match_opportunity_ratings` | Valoraciones post-partido. |
| `sports_venues`, `venue_courts`, `venue_weekly_hours`, `venue_reservations`, `venue_reservation_events` | Centros deportivos y reservas. |
| `geo_countries`, `geo_regions`, `geo_cities` | Geolocalización. |
| `revuelta_external_join_requests` | Solicitudes externas a revuelta privada por equipo. |
| `player_reports` | Moderación de reportes. |
| `match_opportunity_reschedules` | Historial / reprogramaciones. |
| `app_user_feedback` | Feedback de app. |
| `notifications` | In-app: `type` ∈ `chat_message`, `match_invitation`, `match_upcoming_2h`, `match_finished_review_pending`; `payload` jsonb. |
| `push_subscriptions` | Suscripciones web push (endpoint, claves). |
| `sports_venue_reviews` | Reseñas de sedes. |

Vistas y políticas RLS pueden ocultar columnas (por ejemplo `join_code` solo en ciertos casos); revisa migraciones `*_team_pick_*` y `*_rival_match_visibility_*`.

---

## RPC (`supabase.rpc`) usadas desde TypeScript en este repo

Invocación directa en cliente o componentes (nombre exacto para PostgREST):

- `self_heal_duplicate_profile_by_email`
- `self_heal_match_creators_by_email`
- `join_team_pick_match_opportunity`
- `set_team_pick_participant_lineup`
- `organizer_remove_team_pick_participant`
- `book_venue_slot`
- `join_match_opportunity`
- `request_revuelta_external_join`
- `submit_rival_captain_vote`
- `finalize_rival_organizer_override`
- `finalize_rival_match`
- `finalize_revuelta_match`
- `cancel_match_opportunity_with_reason`
- `leave_match_opportunity_with_reason`
- `create_team_with_captain`
- `create_rival_challenge`
- `respond_rival_challenge`
- `accept_team_invite`
- `respond_team_join_request`
- `create_match_opportunity_with_optional_reservation` (parámetros `p_*` en `lib/app-context.tsx`)
- `create_team_pick_match_opportunity` (admin y flujo team pick)
- `fetch_public_player_profile`
- `mark_all_notifications_read`
- `resolve_team_pick_private_join_code`
- `admin_merge_profile_accounts`, `admin_reassign_match_creators` (service role vía API admin)
- `matches_hub_secondary_bundle`
- `match_detail_ratings_bundle`
- `venue_public_reservations_in_range`
- `confirm_venue_reservation_as_booker`, `confirm_venue_reservation_as_owner`, `cancel_venue_reservation_as_owner`
- `team_completed_rival_counts`
- `admin_apply_card`, `admin_ban_user`, `admin_clear_suspension`, `admin_clear_ban`
- `admin_update_player_report_status`
- `reschedule_match_opportunity_with_reason` (paneles admin)

**RPC referenciadas por nombre (string) en lógica** (revisar `lib/app-context.tsx` y similares):

- `accept_revuelta_external_request` / `decline_revuelta_external_request`
- `get_match_opportunity_participant_leave_reasons` (usada desde consultas/mensajes)

**Otras funciones en SQL** (triggers, `SECURITY DEFINER`, helpers como `is_admin()`, `apply_match_stats_from_outcome`, etc.) existen en migraciones; RN no las llama salvo que las expongas como RPC con `GRANT EXECUTE`.

---

## Rutas API Next.js (`/app/api/**/route.ts`)

Estas rutas son **del servidor Vercel/Node**, no de Supabase. RN puede llamarlas con `fetch` si publicas la misma base URL, o ignorarlas y usar solo Supabase + tu backend.

| Ruta aproximada | Rol |
|-----------------|-----|
| `/api/notifications`, `.../read`, `.../read-all` | Lectura/actualización de notificaciones; `read-all` usa RPC `mark_all_notifications_read`. |
| `/api/push/subscribe`, `/api/push/send` | Web push. |
| `/api/cron/notifications/upcoming-2h`, `.../push-dispatch` | Cron (requiere `NOTIFICATIONS_CRON_SECRET`). |
| `/api/admin/*` | merge perfiles, venues, métricas, geo, sanciones, reportes, dashboard jugadores, etc. (sesión admin + a menudo service role). |
| `/api/public-player-profile` | Perfil público agregado en servidor si aplica. |

Lista de archivos: `app/api/**/route.ts` (20 rutas en el árbol actual).

---

## Archivos de código útiles como mapa hacia Supabase

- Cliente browser: `lib/supabase/client.ts`
- Servidor (cookies): `lib/supabase/server.ts`, `lib/supabase/require-session.ts`, `lib/supabase/require-admin.ts`
- Admin service role: `lib/supabase/admin.ts`
- Mutaciones y bundles de partidos: `lib/app-context.tsx`, `lib/services/matches-hub.service.ts`, `lib/services/match-detail.service.ts`
- Consultas mensajes / invitaciones: `lib/supabase/message-queries.ts`
- Team pick: `lib/supabase/team-pick-queries.ts`
- Canchas: `lib/supabase/venue-queries.ts`, `lib/supabase/venue-reservation-mutations.ts`

---

## Documentación adicional en el repo

- `GUIA_REPLICACION_REACT_NATIVE.md` — enfoque de producto y fases para RN.
- `DOCUMENTACION.md` / `DOCUMENTACION-PROYECTO-COMPLETA.md` — contexto amplio (pueden quedar desfasados frente a la última migración; en duda, **manda el SQL en `supabase/migrations/`**).

---

## Matriz de flujos críticos (tablas / RPC / políticas)

| Flujo | Tablas principales tocadas | RPC / funciones usadas | Políticas RLS / reglas clave |
|-------|-----------------------------|-------------------------|-------------------------------|
| `login` (auth + perfil) | `auth.users` (Supabase Auth), `public.profiles` | trigger `handle_new_user()` (creación/sync perfil), utilidades `self_heal_duplicate_profile_by_email`, `self_heal_match_creators_by_email` | RLS de `profiles` (lectura/escritura de propio perfil), `auth.uid()` como identidad base. |
| `crear partido` | `match_opportunities`, `match_opportunity_participants`, `venue_reservations` (si reserva), `match_opportunity_reschedules` (si luego se reprograma) | `create_match_opportunity_with_optional_reservation`, `create_team_pick_match_opportunity`, `book_venue_slot`, `reschedule_match_opportunity_with_reason`, `cancel_match_opportunity_with_reason` | RLS en `match_opportunities` y `match_opportunity_participants`; checks SQL por tipo (`match_type`), cupos, `join_code` para `team_pick_private`, reglas de disponibilidad de cancha. |
| `unirse a partido` | `match_opportunity_participants`, `match_opportunities`, `revuelta_external_join_requests` (privado) | `join_match_opportunity`, `join_team_pick_match_opportunity`, `request_revuelta_external_join`, `accept_revuelta_external_request`, `decline_revuelta_external_request`, `leave_match_opportunity_with_reason` | RLS de participantes por `auth.uid()`; reglas SQL de estado (`participant_status` incluyendo `invited`), límites por rol/arquero/cupos, y validaciones de pertenencia en revuelta privada por equipo. |
| `team pick` (6vs6 público/privado) | `match_opportunities` (`join_code`, `team_pick_color_a/b`, resultados), `match_opportunity_participants` (`pick_team`, `encounter_lineup_role`, `is_goalkeeper`) | `create_team_pick_match_opportunity`, `resolve_team_pick_private_join_code`, `join_team_pick_match_opportunity`, `set_team_pick_participant_lineup`, `organizer_remove_team_pick_participant`, `finalize_revuelta_match` | RLS + vistas que enmascaran `join_code` cuando no corresponde; constraints SQL de colores/`join_code`; triggers de lineup y sincronización GK (`encounter_lineup_role` -> `is_goalkeeper`). |
| `chat` de partido | `messages`, `match_opportunities`, `match_opportunity_participants`, `notifications` | acceso directo a `messages` + helper `can_access_opportunity_thread(...)`; `mark_all_notifications_read` para in-app | Políticas de `messages` condicionadas a acceso al hilo (creador/participante/autorizado); RLS en `notifications` por `user_id = auth.uid()` para lectura/actualización propia. |

Notas de implementación para RN:

- Cuando un flujo falle con `anon key`, revisar primero **RLS + estado de sesión** antes que la UI.
- Para auditoría exacta de políticas activas: revisar `supabase/migrations/*rls*.sql` y `CREATE POLICY` más reciente por tabla.
- Si RN necesita “privilegios admin”, no usar `service_role` en la app: enrutar por backend seguro (`/api/admin/*` o servicio propio).

---

## Checklist rápido para el proyecto React Native

1. Mismo `SUPABASE_URL` + `ANON_KEY`; autenticación con el mismo `auth.users`.
2. Reutilizar nombres de tablas/RPC de este documento y de las migraciones.
3. Respetar **RLS**: lo que falla en RN suele ser política, no “bug de Supabase”.
4. Web Push y rutas `/api/push/*` / crons son **específicos del despliegue Next**; en RN define estrategia propia (FCM, etc.) si necesitas push nativo.
5. Para columnas nuevas, **diff de migraciones** entre ramas o `supabase db dump --schema public` contra el proyecto real.

---

*Generado como contrato de referencia para compartir base de datos entre este repositorio y una app React Native. Última revisión de inventario: tablas y RPC alineadas con el árbol de migraciones y greps en código TypeScript del workspace.*
