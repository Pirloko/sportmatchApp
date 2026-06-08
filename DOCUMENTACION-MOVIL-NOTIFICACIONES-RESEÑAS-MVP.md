# Documentación — App móvil SportMatch

Resumen de lo implementado en el repo **COPIAconExpo** (Expo / React Native): centro de notificaciones, push en background, reseñas unificadas post-partido, contador MVP en perfil y compartir perfil en Instagram.

**Backend compartido:** Supabase (PostgreSQL + RLS + PostgREST + Realtime), mismo proyecto que la web.

---

## 1. Notificaciones in-app (Fase 1)

### Objetivo

Reemplazar el enlace fijo de la campanita del home (`/partidos?tab=chats`) por un **centro de notificaciones real** con badge numérico.

### Archivos principales

| Archivo | Rol |
|---------|-----|
| `lib/notifications/types.ts` | Tipos `AppNotification`, payload |
| `lib/notifications/resolve-route.ts` | Deep links desde notificación / push |
| `lib/supabase/notification-queries.ts` | Fetch, contador no leídas, marcar leídas |
| `lib/hooks/use-unread-notifications.ts` | Badge + realtime Supabase |
| `components/notifications-screen.tsx` | UI del centro |
| `app/notificaciones.tsx` | Ruta |
| `app/_layout.tsx` | Stack screen `notificaciones` |
| `components/player-home-screen.tsx` | Campanita → `/notificaciones` + badge |

### Tipos de notificación soportados

- `chat_message`
- `match_invitation`
- `match_upcoming_2h`
- `match_finished_review_pending`

### Restricción de producto

La **campanita solo está en el home** del jugador. No se agregó a Partidos, Perfil ni otras pantallas.

---

## 2. Push remoto — Expo / FCM (Fase 2)

### Objetivo

Enviar push al dispositivo cuando hay notificaciones in-app pendientes (`push_sent_at IS NULL`).

### SQL (ejecutar una vez)

`scripts/mobile-push-subscriptions-migration.sql`

- Tabla `mobile_push_subscriptions` (tokens `ExponentPushToken[...]`)
- RLS: cada usuario gestiona sus tokens

### Cron de despacho

`scripts/notifications-cron-dispatch.mjs`  
Comando: `npm run notifications:dispatch`

Variables (solo servidor/CI, **nunca** en la app):

```bash
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

El script:

1. Llama `create_match_upcoming_2h_notifications` (recordatorios 2 h antes)
2. Busca notificaciones con `push_sent_at IS NULL`
3. Envía push vía **Expo Push API** (`exp.host`)
4. Marca `push_sent_at`

Programar cada **5–15 min** (GitHub Actions, Vercel Cron, etc.).

### Cliente push

| Archivo | Cambio |
|---------|--------|
| `lib/push/register-device.ts` | Solo `mobile_push_subscriptions` (sin fallback roto a `push_subscriptions`) |
| `lib/push/bootstrap.tsx` | Canal Android, sonido, badge del icono sincronizado con no leídas |
| `lib/push/push-data.ts` | Payload alineado con deep links |

### Checklist operativo

1. Ejecutar SQL de `mobile_push_subscriptions`
2. Configurar **FCM v1** en EAS (expo.dev → Credentials → Android)
3. Build nativa en **dispositivo físico** (no Expo Go Android para push)
4. Configurar cron con service role
5. **No correr dos crons en paralelo** con la web (`/api/cron/notifications/push-dispatch`) — comparten `push_sent_at`

---

## 3. Reseñas unificadas post-partido (móvil alineado con web)

### Contexto

La web migró al formato unificado (junio 2026). El móvil tenía formato **legacy** (`organizer_rating`) y quedaba **roto** tras aplicar el SQL unificado en Supabase.

### Formato actual (obligatorio al enviar reseña)

| Campo UI | Columna DB |
|----------|------------|
| Recinto deportivo | `venue_rating` (1–5) |
| Ambiente del partido | `match_rating` (1–5) |
| Nivel del partido | `level_rating` (1–5) |
| MVP del partido | `mvp_user_id` (UUID) |
| Comentario | `comment` (opcional, máx. 2000) |

### Reglas de negocio

- Solo partidos `completed` con `finalized_at`
- **Sin caducidad** de 48 h para reseñar (el chat post-partido sigue cerrando a las 48 h)
- Una reseña por usuario y partido (`UNIQUE (opportunity_id, rater_id)`)
- Solo **INSERT** (no editar reseña enviada)
- Elegibles: organizador o participante `confirmed`

### Archivos modificados

| Archivo | Rol |
|---------|-----|
| `lib/match-review-eligibility.ts` | Elegibilidad reseña y MVP |
| `lib/supabase/rating-queries.ts` | Tipos, agregados (`avgVenue`, `mvpTally`), RPC bundle |
| `lib/app-provider.tsx` | `submitMatchRating` con payload unificado |
| `components/match-completion-panel.tsx` | Formulario + selector MVP |
| `components/match-detail-screen.tsx` | Resumen (recinto, ambiente, nivel, MVP ganador) |
| `components/chat-screen.tsx` | Pasa participantes al panel de reseña |

### SQL de referencia (web / Supabase)

Migración unificada aplicada manualmente en Supabase (columnas `venue_rating`, `mvp_user_id`, trigger `enforce_match_rating_rules`, RPCs `match_detail_ratings_bundle` y `matches_hub_secondary_bundle`).

---

## 4. MVP — votación, perfil y restricciones

### Cómo funciona el MVP

- Cada reseña incluye **un voto MVP** hacia otro participante elegible.
- **MVP del partido** (UI): jugador con **más votos** en ese partido (`mvpTally[0]`).
- **Contador en perfil:** **+1 por partido** donde fue **MVP ganador** (más votos), no la suma de votos sueltos.
- **Independiente de V/E/D:** puede perder el partido y sumar +1 MVP.
- **No autoelegirse:** el reseñador no puede votarse a sí mismo.

### SQL (ejecutar en Supabase)

`scripts/player-mvp-stats-migration.sql`

1. Trigger: rechaza `mvp_user_id = rater_id`
2. Función `player_mvp_wins_count(p_user_id)` — partidos ganados como MVP
3. RPC `fetch_public_player_profile` actualizado con `stats_mvp_wins`

### App móvil

| Archivo | Rol |
|---------|-----|
| `lib/supabase/mvp-queries.ts` | Cliente RPC `player_mvp_wins_count` |
| `lib/match-review-eligibility.ts` | `filterMvpVoteCandidates` (excluye al reseñador) |
| `components/match-completion-panel.tsx` | Lista MVP sin el usuario actual |
| `lib/app-provider.tsx` | Validación cliente anti auto-MVP |
| `components/profile-screen.tsx` | Stat **MVP** en estadísticas |
| `components/public-player-profile-modal.tsx` | MVP en perfil público |
| `lib/types.ts` | `statsMvpWins` en `User` |
| `lib/supabase/public-player-profile.ts` | Mapeo `stats_mvp_wins` |

---

## 5. Compartir perfil en Instagram Stories

### Objetivo

Tarjeta visual 9:16 con foto, nombre y estadísticas para compartir vía share sheet del sistema (el usuario elige Instagram → Historia).

### Contenido de la tarjeta

- Foto de perfil y nombre
- Victorias, empates, derrotas
- MVP (partidos como MVP ganador)
- Tarjetas amarillas y rojas
- Partidos organizados finalizados
- Cantidad de equipos

### Archivos

| Archivo | Rol |
|---------|-----|
| `components/profile-share-card.tsx` | Diseño de la tarjeta (360×640) |
| `lib/share-profile-instagram.ts` | Captura (`react-native-view-shot`) + `expo-sharing` |
| `components/profile-screen.tsx` | Botón «Compartir en Instagram» |

### Dependencias añadidas

- `react-native-view-shot`
- `expo-sharing`

### Nota

Instagram no expone API pública para publicar Stories directamente desde la app. El flujo es: generar PNG → menú compartir del SO → usuario selecciona Instagram.

---

## 6. Scripts SQL del repo (orden sugerido)

| Script | Cuándo ejecutar |
|--------|-----------------|
| `scripts/mobile-push-subscriptions-migration.sql` | Antes de registrar tokens push |
| SQL unificado reseñas (web) | Antes de reseñas móvil formato nuevo |
| `scripts/player-mvp-stats-migration.sql` | Antes de contador MVP y no auto-voto |

---

## 7. Comandos útiles

```bash
# Despacho push (servidor)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run notifications:dispatch

# Build preview Android
npx eas-cli build --platform android --profile preview

# Typecheck
npx tsc --noEmit
```

---

## 8. Pendiente / no implementado en móvil

- Reseñas de centro solo cancha (`sports_venue_reviews`)
- Promedios de reseñas en hub de partidos (`matches_hub_secondary_bundle`)
- Opción «voto MVP nulo» / abstención en reseña
- Integrar envío Expo en el cron de Next.js de la web (alternativa al script standalone)
- Cupos disponibles / descubrimiento (no existen en BD actual)

---

## 9. Pruebas recomendadas

### Notificaciones

1. Login en build nativa → fila en `mobile_push_subscriptions`
2. Mensaje de chat → aparece en `/notificaciones`
3. Cron dispatch → push con app cerrada

### Reseñas

1. Partido finalizado → formulario con recinto, ambiente, nivel, MVP
2. Enviar sin auto-MVP → OK
3. Auto-MVP → error en app y en BD

### MVP perfil

1. Varios jugadores reseñan el mismo partido
2. El más votado → +1 en `player_mvp_wins_count`
3. Perfil propio y perfil público muestran el contador

### Instagram

1. Perfil → «Compartir en Instagram»
2. Elegir Instagram en el share sheet
3. Verificar imagen con todas las stats

---

*Última actualización: mayo 2026 — SportMatch app móvil (COPIAconExpo).*
