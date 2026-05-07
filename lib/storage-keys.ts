/** Mismas claves que en la web (sessionStorage) para limpiar al cerrar sesión. */
export const JOIN_TEAM_STORAGE_KEY = 'pichanga_join_team'
export const JOIN_REGISTER_STORAGE_KEY = 'pichanga_join_register'
export const JOIN_MATCH_STORAGE_KEY = 'pichanga_join_match'
export const OPEN_CREATE_AFTER_AUTH_KEY = 'pichanga_open_create_after_auth'
/** Prefill «Crear partido» desde página pública de centro (`/centro/[id]`). */
export const CREATE_PREFILL_STORAGE_KEY = 'pichanga_create_prefill'
/** Última pestaña principal del jugador (tabs). */
export const PLAYER_LAST_NAV_STORAGE_KEY = 'pichanga-last-nav-screen'
/** Equipo rival preseleccionado al pulsar «Desafiar» desde equipos. */
export const RIVAL_TARGET_TEAM_STORAGE_KEY = 'pichanga_rival_target_team'
/** Deep link `sportmatch://equipo/...` (esquema en app.json) antes de iniciar sesión; se consume al entrar como jugador. */
export const PENDING_TEAM_FOCUS_STORAGE_KEY = 'pichanga-pending-team-focus'
