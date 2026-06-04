import type { RevueltaLineup } from './revuelta-lineup'

export type Gender = 'male' | 'female'

export type Position = 'portero' | 'defensa' | 'mediocampista' | 'delantero'

export type Level = 'principiante' | 'intermedio' | 'avanzado' | 'competitivo'

export type MatchType =
  | 'rival'
  | 'players'
  | 'open'
  | 'team_pick_public'
  | 'team_pick_private'
  /** Compatibilidad temporal con datos antiguos. */
  | 'team_pick'

export type TeamPickTeam = 'A' | 'B'
export type TeamPickRole = 'gk' | 'defensa' | 'mediocampista' | 'delantero'

/** Búsqueda de jugadores: qué cupos ofrece el organizador. */
export type PlayersSeekProfile =
  | 'gk_only'
  | 'field_only'
  | 'gk_and_field'

export type MatchStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'

export type { RevueltaLineup }

/** Pestañas de la pantalla Partidos (hub). */
export type MatchesHubTab = 'upcoming' | 'chats' | 'finished'

/** Resultado en partidos tipo rival (equipo del creador vs rival). */
export type RivalResult = 'creator_team' | 'rival_team' | 'draw'

export type AccountType = 'player' | 'venue' | 'admin'

export interface User {
  id: string
  email: string
  name: string
  age: number
  gender: Gender
  position: Position
  level: Level
  city: string
  availability: string[]
  photo: string
  bio?: string
  whatsappPhone?: string
  createdAt: Date
  /** Por defecto jugador; `venue` solo vía administración en Supabase. */
  accountType?: AccountType
  /** Estadísticas persistidas en `profiles` (migraciones SportMatch). */
  statsPlayerWins?: number
  statsPlayerDraws?: number
  statsPlayerLosses?: number
  statsOrganizerWins?: number
  /** Moderación: tarjetas por reportes. */
  modYellowCards?: number
  modRedCards?: number
  /** FK `geo_cities`; filtro “Equipos en tu región”. */
  cityId?: string | null
  /** Región de la ciudad del perfil (vía `geo_cities.region_id`). */
  homeRegionId?: string | null
  /** true si no hay fila en `profiles` y se usó usuario mínimo post-OAuth */
  missingDbProfile?: boolean
}

export interface SportsVenue {
  id: string
  ownerId: string
  name: string
  address: string
  mapsUrl: string | null
  phone: string
  city: string
  /** FK `geo_cities`; requerido por RPC `create_team_pick_match_opportunity`. */
  cityId?: string | null
  slotDurationMinutes: number
  createdAt: Date
}

export interface VenueCourt {
  id: string
  venueId: string
  name: string
  sortOrder: number
}

export interface VenueWeeklyHour {
  id: string
  venueId: string
  /** 0 = domingo … 6 = sábado. */
  dayOfWeek: number
  openTime: string
  closeTime: string
}

export interface VenueReservationRow {
  id: string
  courtId: string
  startsAt: Date
  endsAt: Date
  bookerUserId: string | null
  matchOpportunityId: string | null
  status: 'pending' | 'confirmed' | 'cancelled'
  paymentStatus?: 'unpaid' | 'deposit_paid' | 'paid'
  pricePerHour?: number | null
  currency?: string
  depositAmount?: number | null
  paidAmount?: number | null
  confirmedAt?: Date | null
  cancelledAt?: Date | null
  cancelledReason?: string | null
  confirmedByUserId?: string | null
  confirmationSource?: 'venue_owner' | 'booker_self' | 'admin' | null
  confirmationNote?: string | null
  notes?: string | null
}

export interface TeamMember {
  id: string
  name: string
  position: Position
  photo: string
  status: 'confirmed' | 'pending' | 'invited'
}

export interface Team {
  id: string
  name: string
  logo?: string
  level: Level
  captainId: string
  /** Segundo capitán (BD: teams.vice_captain_id). */
  viceCaptainId?: string | null
  members: TeamMember[]
  city: string
  gender: Gender
  description?: string
  createdAt: Date
  cityId?: string | null
  homeRegionId?: string | null
  /** Partidos rival cerrados (BD). */
  statsWins?: number
  statsDraws?: number
  statsLosses?: number
  statsWinStreak?: number
  statsLossStreak?: number
}

/** Solo lectura para miembros vía tabla `team_private_settings` (RLS). */
export interface TeamPrivateSettings {
  teamId: string
  whatsappInviteUrl: string | null
  rulesText: string | null
}

export interface TeamInvite {
  id: string
  teamId: string
  teamName: string
  inviterId: string
  inviterName: string
  inviteeId: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: Date
}

/** Jugador solicita unirse; el capitán acepta o rechaza. */
export interface TeamJoinRequest {
  id: string
  teamId: string
  teamName: string
  requesterId: string
  requesterName: string
  requesterPhoto: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: Date
}

export type RivalChallengeMode = 'direct' | 'open'
export type RivalChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export interface RivalChallenge {
  id: string
  opportunityId: string
  opportunityTitle: string
  mode: RivalChallengeMode
  status: RivalChallengeStatus
  challengerTeamId: string
  challengerTeamName: string
  challengerCaptainId: string
  challengedTeamId?: string
  challengedTeamName?: string
  challengedCaptainId?: string
  acceptedTeamId?: string
  acceptedTeamName?: string
  acceptedCaptainId?: string
  createdAt: Date
  respondedAt?: Date
}

export interface MatchOpportunity {
  id: string
  type: MatchType
  title: string
  description?: string
  location: string
  venue: string
  /** Centro deportivo vinculado (opcional). */
  sportsVenueId?: string
  venueReservationId?: string
  dateTime: Date
  level: Level
  creatorId: string
  creatorName: string
  creatorPhoto: string
  teamName?: string
  playersNeeded?: number
  playersJoined?: number
  /** Solo type players: cupos (arquero / campo / ambos). */
  playersSeekProfile?: PlayersSeekProfile
  gender: Gender
  status: MatchStatus
  createdAt: Date
  /** Cuando el organizador cerró el partido (inicio ventana 48 h para calificar). */
  finalizedAt?: Date
  rivalResult?: RivalResult
  /** Partidos players/open: marcado como jugado sin marcador de equipos. */
  casualCompleted?: boolean
  /** Suspensión/cancelación por organizador con motivo. */
  suspendedAt?: Date
  suspendedReason?: string
  /** Revuelta: equipos A/B tras sorteo del organizador. */
  revueltaLineup?: RevueltaLineup
}

export interface Match {
  id: string
  opportunityId: string
  participants: string[]
  status: MatchStatus
  createdAt: Date
}

export interface Message {
  id: string
  matchId: string
  senderId: string
  content: string
  createdAt: Date
}

export interface OnboardingData {
  name: string
  age: number
  /** ISO `YYYY-MM-DD`; la BD sincroniza `age` vía trigger. */
  birthDate: string
  gender: Gender
  whatsappPhone: string
  position: Position
  level: Level
  availability: string[]
  city: string
  cityId: string | null
  photo: string
}

/** Primer alta del centro en la app (crea `sports_venues`). */
export interface VenueOnboardingData {
  name: string
  address: string
  phone: string
  city: string
  mapsUrl: string | null
  slotDurationMinutes: number
}
