import type {
  Gender,
  Level,
  MatchOpportunity,
  MatchStatus,
  MatchType,
  Position,
  RivalResult,
  User,
} from '../types'
import { parseRevueltaLineup } from '../revuelta-lineup'
import { parsePlayersSeekProfile } from '../players-seek-profile'

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face'

export type ProfileRow = {
  id: string
  name: string
  age: number
  gender: Gender
  position: Position
  level: Level
  city: string
  availability: string[]
  photo_url: string
  bio: string | null
  whatsapp_phone?: string | null
  created_at: string
  account_type?: 'player' | 'venue' | 'admin' | null
  stats_player_wins?: number | null
  stats_player_draws?: number | null
  stats_player_losses?: number | null
  stats_organizer_wins?: number | null
  mod_yellow_cards?: number | null
  mod_red_cards?: number | null
  city_id?: string | null
  geo_cities?:
    | { region_id: string }
    | { region_id: string }[]
    | null
}

function regionIdFromGeoEmbed(
  geo: ProfileRow['geo_cities']
): string | null {
  if (!geo) return null
  const first = Array.isArray(geo) ? geo[0] : geo
  return first?.region_id ?? null
}

export function profileRowToUser(row: ProfileRow, email: string): User {
  return {
    id: row.id,
    email,
    name: row.name,
    age: row.age,
    gender: row.gender,
    position: row.position,
    level: row.level,
    city: row.city,
    availability: row.availability ?? [],
    photo: row.photo_url || DEFAULT_AVATAR,
    bio: row.bio ?? undefined,
    whatsappPhone: row.whatsapp_phone ?? undefined,
    createdAt: new Date(row.created_at),
    accountType:
      row.account_type === 'venue'
        ? 'venue'
        : row.account_type === 'admin'
          ? 'admin'
          : 'player',
    statsPlayerWins: row.stats_player_wins ?? 0,
    statsPlayerDraws: row.stats_player_draws ?? 0,
    statsPlayerLosses: row.stats_player_losses ?? 0,
    statsOrganizerWins: row.stats_organizer_wins ?? 0,
    modYellowCards: row.mod_yellow_cards ?? 0,
    modRedCards: row.mod_red_cards ?? 0,
    cityId: row.city_id ?? null,
    homeRegionId: regionIdFromGeoEmbed(row.geo_cities),
  }
}

export type MatchOpportunityRow = {
  id: string
  type: MatchType
  title: string
  description: string | null
  location: string
  venue: string
  date_time: string
  level: Level
  creator_id: string
  team_name: string | null
  players_needed: number | null
  players_joined: number
  players_seek_profile?: string | null
  gender: Gender
  status: MatchStatus
  created_at: string
  finalized_at?: string | null
  rival_result?: RivalResult | null
  casual_completed?: boolean | null
  suspended_at?: string | null
  suspended_reason?: string | null
  revuelta_lineup?: unknown | null
  sports_venue_id?: string | null
  venue_reservation_id?: string | null
}

export type CreatorSnippet = {
  id: string
  name: string
  photo_url: string
}

export function mapMatchOpportunityFromDb(
  row: MatchOpportunityRow,
  creator: CreatorSnippet | null
): MatchOpportunity {
  const c = creator ?? {
    id: row.creator_id,
    name: 'Jugador',
    photo_url: DEFAULT_AVATAR,
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? undefined,
    location: row.location,
    venue: row.venue,
    dateTime: new Date(row.date_time),
    level: row.level,
    creatorId: row.creator_id,
    creatorName: c.name || 'Jugador',
    creatorPhoto: c.photo_url || DEFAULT_AVATAR,
    teamName: row.team_name ?? undefined,
    playersNeeded: row.players_needed ?? undefined,
    playersJoined: row.players_joined,
    playersSeekProfile: parsePlayersSeekProfile(row.players_seek_profile),
    gender: row.gender,
    status: row.status,
    createdAt: new Date(row.created_at),
    finalizedAt:
      row.finalized_at != null ? new Date(row.finalized_at) : undefined,
    rivalResult: row.rival_result ?? undefined,
    casualCompleted:
      row.casual_completed === null || row.casual_completed === undefined
        ? undefined
        : row.casual_completed,
    suspendedAt: row.suspended_at ? new Date(row.suspended_at) : undefined,
    suspendedReason: row.suspended_reason ?? undefined,
    revueltaLineup:
      parseRevueltaLineup(row.revuelta_lineup) ?? undefined,
    sportsVenueId: row.sports_venue_id ?? undefined,
    venueReservationId: row.venue_reservation_id ?? undefined,
  }
}

export { DEFAULT_AVATAR }
