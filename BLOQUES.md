# COPIAconExpo — avance por bloques

Referencia: `b_byvrcGGryVd-1774199449730/` (Next). Objetivo: misma lógica y UX en Expo (web primero, luego nativo).

---

## Hechos (1–18)

### Bloque 1 — Base Expo Router

- `expo-router` + safe area, `app/_layout.tsx`, `app/index.tsx`
- `tsconfig.json` excluye `b_byvrcGGryVd-1774199449730` y `dist` (referencia Next no entra en `tsc`)

### Bloque 2 — Supabase en el cliente

- Cliente, tipos, variables `EXPO_PUBLIC_*`, polyfills

### Bloque 3 — AppProvider + auth

- Sesión, login/logout, datos globales, `auth-screen`

### Bloque 4 — Onboarding jugador y alta centro

- Onboarding jugador, venue onboarding, foto de perfil

### Bloque 5 — Partidos (lista + detalle + unirse)

- Hub + detalle, `join-match-opportunity`, `format-match`

### Bloque 6 — Shell jugador + tabs

- `app/(tabs)/_layout.tsx`: **Tabs** como `BottomNav` del original (Inicio, Explorar, Partidos, Crear, Equipos, Perfil)
- Jugador tras onboarding: `app/index.tsx` → `PlayerEntryRedirect` (`/home` o `/crear` si hay prefill tras auth); auth/onboarding en `/`
- Edición de perfil: tabs redirigen a `/` para `OnboardingScreen`
- Partidos: `app/(tabs)/partidos/` (`/partidos`, `/partidos/[id]`)
- Venue / admin: sin tabs en `/`

### Bloque 7 — Inicio (home) jugador

- `components/player-home-screen.tsx` + `home-match-card.tsx` (paridad con `home-screen` del Next)
- Filtros rápidos: todos / rival / players / revuelta; lista filtrada por género y fecha ≥ hoy
- `getFilteredMatches`, `getUserTeams`, `acceptRivalOpportunityWithTeam` en `lib/app-provider.tsx`
- Modales RN: `join-revuelta-modal.tsx`, `join-players-modal.tsx`; hook `lib/use-match-participant-counts.ts`
- Navegación: detalle `/partidos/[id]`, equipos `/equipos`, explorar `/explorar`, campana → `/partidos?tab=chats`
- Compartir revuelta vía `Share` nativo; sin `ThemeMenuButton` del Next (Bloque 17)

### Bloque 8 — Explorar

- `components/explore-screen.tsx`: búsqueda por texto, panel tipo/nivel, contador de filtros
- Lista de partidos (misma lógica de join que home) con `HomeMatchCard` + modales revuelta/jugadores + `RivalTeamPickerModal`
- Centros: `fetchSportsVenuesList` en `lib/supabase/venue-owner-queries.ts`; carrusel horizontal; toque → `Alert` con «Página del centro» → `/centro/[id]`, mapa si hay `mapsUrl`
- `lib/alert-join-result.ts` compartido con inicio; selector de equipo rival extraído a `components/rival-team-picker-modal.tsx`
- Pestaña `app/(tabs)/explorar.tsx` con `headerShown: false`

### Bloque 9 — Crear partido

- `components/create-match-screen.tsx`: flujos rival (4 pasos), jugadores (4), revuelta (2), reserva solo cancha; guías iniciales
- `lib/app-provider.tsx`: `getFilteredTeams`, `addMatchOpportunity` (insert + `book_venue_slot` + participante organizador en revuelta), `reserveVenueOnly`, `createRivalChallenge`
- `lib/time-slot-options.ts`, `lib/venue-slots.ts` (`computeVenueAvailableSlots`), `lib/supabase/venue-public-queries.ts` (canchas, horarios semanales, reservas en rango)
- Fecha manual `AAAA-MM-DD`; hora vía modal (slots del centro o `TIME_SLOT_OPTIONS`); sugerencia de centros alternativos si no hay cupo
- `app/(tabs)/crear.tsx`, pestaña Crear con `headerShown: false`
- `rival-prefill` (equipos) + `create-prefill` desde página pública `/centro/[venueId]` → pestaña Crear con datos del slot (Bloque 17)

### Bloque 10 — Swipe

- `components/swipe-screen.tsx`: stack de cartas, `PanResponder`, like/nope, deshacer, estado vacío; datos vía `getFilteredUsers(gender)` en `lib/app-provider.tsx`
- Ruta `app/swipe.tsx` + `Stack.Screen` en `app/_layout.tsx` (`headerShown: false`)
- Enlace desde inicio: banner «Swipe» en `player-home-screen.tsx` → `/swipe`

### Bloque 11 — Chat

- `lib/supabase/rating-queries.ts`: ventana de mensajes (`isMatchChatMessagingOpen`, `getRatingDeadline`, reseñas agregadas para Bloque 14)
- `lib/supabase/message-queries.ts`: ya existía; `fetchLastMessagesForOpportunities` para lista en hub
- `components/chat-screen.tsx`: mensajes, envío, realtime `postgres_changes`, panel info (fecha, lugar, participantes), enlace a detalle; `formatRelativeUntil` en `lib/format-match.ts`
- Ruta `app/(tabs)/partidos/chat/[id].tsx` → `/partidos/chat/:id`; `Stack.Screen` en `partidos/_layout.tsx`
- `matches-hub-screen.tsx`: pestaña **Chats**, preview último mensaje, orden por actividad; `?tab=chats` vía `useLocalSearchParams`
- `match-detail-screen.tsx`: «Abrir chat del partido» si participas; campana en `player-home-screen.tsx` → `/partidos?tab=chats`
- `MatchCompletionPanel` y revuelta avanzada: Bloque 14

### Bloque 12 — Perfil jugador

- `components/profile-screen.tsx`: cabecera, foto (galería + `updateProfilePhoto` en `lib/app-provider.tsx`), stats (partidos finalizados, equipos, victorias como organizador en rivales), badges nivel/posición/edad, disponibilidad por día
- Menú: **Editar perfil** → `openProfileEditor` / `OnboardingScreen`; **Mis equipos** → `/equipos`; **Historial** → `/partidos?tab=mine`; **Configuración** → modal (apariencia/notificaciones/privacidad/acerca; tema global en Bloque 17)
- `app/(tabs)/perfil.tsx` con `headerShown: false` en tabs; cuenta no jugador: sesión + cerrar sesión
- `matches-hub-screen.tsx`: `?tab=mine` y `?tab=explore` para alinear enlaces desde perfil

### Bloque 13 — Equipos

- `lib/supabase/team-logos.ts`: subida de escudo desde URI (Expo) + borrado en storage
- `lib/team-invite-url.ts`, `lib/rival-prefill.ts` + `RIVAL_TARGET_TEAM_STORAGE_KEY` en `storage-keys.ts` (Desafiar → Crear con rival preseleccionado)
- `lib/app-provider.tsx`: `createTeam`, `updateTeam`, `deleteTeam`, `leaveTeam`, `updateTeamPrivateSettings`, `inviteToTeam`, `respondToInvite`, `requestToJoinTeam`, `respondToJoinRequest`, `cancelJoinRequest`, `respondToRivalChallenge`, `refreshTeamData`, `teamsDetailFocusTeamId` / `setTeamsDetailFocusTeamId`
- `components/teams-screen.tsx`: lista (invitaciones, solicitudes a tus equipos, desafíos rival), mis equipos, otros equipos del género; crear equipo; detalle (escudo, edición capitán, solicitudes, WhatsApp/reglas privadas, plantilla, compartir cupo); invitar jugadores; **Desafiar** guarda rival y abre **Crear**; aceptar desafío navega al chat del partido
- `app/(tabs)/equipos.tsx` + `headerShown: false` en tabs; `create-match-screen.tsx` consume `consumeRivalTargetTeamId` en paso 2 (rival)

### Bloque 14 — Partido: cierre y calificaciones

- `lib/app-provider.tsx`: `finalizeMatchOpportunity`, `suspendMatchOpportunity`, `submitMatchRating` (paridad con `app-context` Next)
- `components/match-completion-panel.tsx`: finalizar (rival/casual), suspender con motivos, formulario de estrellas + comentario (ventana 48 h)
- `components/match-detail-screen.tsx`: participantes, resumen de calificaciones + comentarios recientes, panel de cierre al final del scroll
- `components/chat-screen.tsx`: mismo panel bajo el enlace al detalle

### Bloque 15 — Panel recinto (venue)

- `lib/supabase/venue-owner-queries.ts`: `fetchVenueCourts`, `fetchVenueWeeklyHours`, `fetchVenueReservationsRange` (paridad con referencia `venue-queries`)
- `lib/venue-slots.ts`: `WEEKDAY_SHORT_ES`
- `components/venue-dashboard-screen.tsx`: pestañas Reservas / Perfil / Canchas / Horario; reservas del día, confirmar/cancelar (modal motivo), reserva manual, WhatsApp organizador/reservante, copiar enlace público (`expo-clipboard` + `EXPO_PUBLIC_SITE_URL` o `window.location.origin` en web)
- `app/mi-centro.tsx` (panel dueño; ruta `/mi-centro`) + `Redirect` desde `app/index.tsx` para cuentas `account_type === 'venue'`; `Stack.Screen` en `app/_layout.tsx` (la carpeta `app/centro/[venueId].tsx` es la página **pública** `/centro/:id`, incompatible con un archivo `centro.tsx` en la raíz de `app/`)

### Bloque 16 — Admin

- `lib/supabase/admin-queries.ts`: `fetchAdminMetrics` (misma lógica que `GET /api/admin/metrics` del Next; requiere RLS que permita al admin leer `venue_reservations`, `venue_courts`, `sports_venues`, `match_opportunities`, `profiles` según corresponda)
- `lib/supabase/admin-create-venue.ts`: alta de centro vía `POST` opcional a `EXPO_PUBLIC_ADMIN_BACKEND_URL/api/admin/create-venue-user` con `Authorization: Bearer <access_token>`
- `components/admin-dashboard-screen.tsx`: rangos, totales, tipos, top centros, tabla detallada (scroll horizontal), formulario crear usuario centro
- `app/admin.tsx` + `Redirect` desde `app/index.tsx` para `account_type === 'admin'`; referencia Next `b_byvrcGGryVd-1774199449730/app/api/admin/create-venue-user/route.ts` actualizada para validar JWT Bearer (Expo / clientes sin cookies)

### Bloque 17 — Landing y pulido global

- Página pública `app/centro/[venueId].tsx` + `components/venue-centro-screen.tsx`: slots, `venue_public_reservations_in_range`, prefill «Crear partido» (`lib/create-prefill.ts`), barra inferior enlaza a tabs; URL copiada desde el dashboard sigue siendo `/centro/{uuid}`
- `app/landing.tsx` + `components/landing-screen.tsx`; enlace «¿Qué es Pichanga?» en `auth-screen.tsx` → `/landing`
- `lib/theme-context.tsx` (`ThemeProvider` en `app/_layout.tsx`); `lib/player-nav-storage.ts` + `persistPlayerLastNav` en `app/(tabs)/_layout.tsx`
- `components/player-entry-redirect.tsx`: tras login jugador, `/crear` si `OPEN_CREATE_AFTER_AUTH` + prefill; logout limpia prefill y última pestaña en `app-provider.tsx`
- `create-match-screen.tsx` aplica `readCreatePrefill` / `clearCreatePrefill` al cargar centros

### Bloque 18 — Nativo duro

- Permisos: `expo-image-picker` (galería + `cameraPermission` por si en el futuro se usa cámara); `app.json` con `ios.bundleIdentifier` y `android.package` (`com.pichanga.expo`) para compilar en dispositivo / tiendas
- Deep links: esquema `pichanga` (ya en `app.json`); `pichanga://equipo/${teamId}` → `app/equipo/[teamId].tsx` (abre detalle en Equipos vía `setTeamsDetailFocusTeamId`; si no hay sesión, guarda `PENDING_TEAM_FOCUS_STORAGE_KEY` y `PlayerEntryRedirect` lo aplica tras login). URLs públicas de centro siguen siendo `pichanga://centro/...` o `Linking.createURL('/centro/...')` como en el panel de recinto
- Android: `lib/android-image-picker-pending.ts` + `getPendingResultAsync` integrado en onboarding y perfil para recuperar la foto si el sistema reinicia la actividad
- Builds: `eas.json` (perfiles `development`, `preview`, `production`). Flujo típico: `npm i -g eas-cli` / `npx eas-cli login`, `eas build --profile preview --platform android|ios` (requiere cuenta Expo y proyecto vinculado con `eas init` la primera vez)
- Pruebas en dispositivo: `npx expo run:ios` / `run:android` con Xcode/Android Studio, o build EAS + instalación del artefacto

---

## Pendiente (orden sugerido)

- Mejoras futuras: App Links HTTPS (`associatedDomains` en iOS + Digital Asset Links en Android), notificaciones push, etc.

---

## Cómo seguir

Ir cerrando bloques en orden; tras cada uno, probar web (`npx expo start --web`) y en nativo cuando aplique; marcar el bloque como hecho en este archivo.
