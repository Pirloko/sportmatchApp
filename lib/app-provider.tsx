import AsyncStorage from '@react-native-async-storage/async-storage'
import type {
  Session,
  SupabaseClient,
  User as SupabaseAuthUser,
} from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Platform } from 'react-native'
import type {
  Gender,
  Level,
  MatchType,
  MatchOpportunity,
  OnboardingData,
  RivalChallenge,
  RivalResult,
  SportsVenue,
  Team,
  TeamInvite,
  TeamJoinRequest,
  TeamPickRole,
  TeamPrivateSettings,
  User,
  VenueOnboardingData,
} from './types'
import { nativeAuthCallbackUrl } from './app-linking'
import {
  DEFAULT_AVATAR,
  mapMatchOpportunityFromDb,
  type MatchOpportunityRow,
} from './supabase/mappers'
import { createClient, isSupabaseConfigured } from './supabase/client'
import {
  ProductEventNames,
  setAnalyticsUser,
  trackProductEvent,
} from './telemetry/product-analytics'
import { formatAuthError } from './supabase/auth-errors'
import {
  fetchMatchOpportunities,
  fetchOtherProfiles,
  fetchProfileForUser,
} from './supabase/queries'
import {
  fetchTeamInvitesForUser,
  fetchTeamJoinRequestsForUser,
  fetchTeamsWithMembers,
} from './supabase/team-queries'
import { fetchParticipatingOpportunityIds } from './supabase/message-queries'
import { uploadProfileAvatarFromUri } from './supabase/profile-photo'
import { fetchRivalChallengesForUser } from './supabase/rival-challenge-queries'
import { fetchVenueForOwner } from './supabase/venue-owner-queries'
import {
  joinMatchOpportunityAction,
  type JoinMatchResult,
} from './supabase/join-match-opportunity'
import { playersJoinRules } from './players-seek-profile'
import {
  CREATE_PREFILL_STORAGE_KEY,
  JOIN_MATCH_STORAGE_KEY,
  JOIN_REGISTER_STORAGE_KEY,
  JOIN_TEAM_STORAGE_KEY,
  OPEN_CREATE_AFTER_AUTH_KEY,
  PENDING_TEAM_FOCUS_STORAGE_KEY,
  PLAYER_LAST_NAV_STORAGE_KEY,
  RIVAL_TARGET_TEAM_STORAGE_KEY,
} from './storage-keys'

WebBrowser.maybeCompleteAuthSession()

function extractTokensFromRedirect(url: string): {
  accessToken: string | null
  refreshToken: string | null
} {
  const hashIdx = url.indexOf('#')
  const queryIdx = url.indexOf('?')
  let payload = ''
  if (hashIdx >= 0) {
    payload = url.slice(hashIdx + 1)
  } else if (queryIdx >= 0) {
    payload = url.slice(queryIdx + 1).split('#')[0] ?? ''
  }
  if (!payload) {
    return { accessToken: null, refreshToken: null }
  }
  const params = new URLSearchParams(payload)
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
  }
}

/** OAuth PKCE: redirect trae ?code=… en el deep link (sin tokens en el hash). */
function extractAuthCodeFromRedirect(url: string): string | null {
  try {
    const u = new URL(url)
    const code = u.searchParams.get('code')
    if (code) return code
  } catch {
    /* sportmatch:// puede fallar en algunos runtimes */
  }
  const m = url.match(/[?&#]code=([^&#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function isWebCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname === 'www.sportmatch.cl' || u.hostname === 'sportmatch.cl'
  } catch {
    return false
  }
}

function isAuthCallbackUrl(url: string): boolean {
  return (
    url.includes('auth/callback') ||
    url.includes('%2Fauth%2Fcallback')
  )
}

/**
 * Android: al volver con sportmatch:// Chrome Custom Tabs a veces devuelve cancel/dismiss
 * sin `url`, pero el callback llega por Linking. En web seguimos solo con WebBrowser.
 */
async function openOAuthAndResolveCallbackUrl(
  oauthBrowserUrl: string,
  redirectTo: string
): Promise<string> {
  if (Platform.OS === 'web') {
    const authResult = await WebBrowser.openAuthSessionAsync(
      oauthBrowserUrl,
      redirectTo
    )
    if (authResult.type === 'success' && authResult.url) {
      return authResult.url
    }
    throw new Error(
      authResult.type === 'cancel'
        ? 'Inicio con Google cancelado.'
        : 'No se completó el inicio de sesión con Google.'
    )
  }

  return await new Promise((resolve, reject) => {
    let settled = false
    let dismissGraceTimer: ReturnType<typeof setTimeout> | undefined
    let timeoutId: ReturnType<typeof setTimeout>

    const cleanup = () => {
      subscription.remove()
      clearTimeout(timeoutId)
      if (dismissGraceTimer) clearTimeout(dismissGraceTimer)
    }

    const finish = (url: string) => {
      if (settled || !isAuthCallbackUrl(url)) return
      settled = true
      cleanup()
      resolve(url)
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      finish(url)
    })

    timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error('Tiempo agotado al iniciar sesión con Google.'))
      }
    }, 120000)

    void Linking.getInitialURL().then((initial) => {
      if (initial) finish(initial)
    })

    void WebBrowser.openAuthSessionAsync(oauthBrowserUrl, redirectTo)
      .then((authResult) => {
        if (settled) return
        if (authResult.type === 'success' && authResult.url) {
          finish(authResult.url)
          return
        }
        // Dar tiempo a que Linking entregue sportmatch://auth/callback?code=…
        dismissGraceTimer = setTimeout(() => {
          if (!settled) {
            settled = true
            cleanup()
            reject(
              new Error(
                'No se recibió la respuesta del login en la app. Si cancelaste el navegador, inténtalo de nuevo.'
              )
            )
          }
        }, 10000)
      })
      .catch(() => {
        if (settled) return
        dismissGraceTimer = setTimeout(() => {
          if (!settled) {
            settled = true
            cleanup()
            reject(
              new Error(
                'No se recibió la respuesta del login en la app. Inténtalo de nuevo.'
              )
            )
          }
        }, 10000)
      })
  })
}

function isTeamLimitReached(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: unknown }
  return (
    typeof e.message === 'string' && e.message.includes('team_limit_reached')
  )
}

function getAuthUserEmail(u: SupabaseAuthUser): string | undefined {
  if (u.email) return u.email
  const meta = u.user_metadata
  if (meta && typeof meta.email === 'string') return meta.email
  return undefined
}

function needsOnboardingProfile(u: User): boolean {
  if (u.accountType !== 'player') return false
  return u.name.trim().length < 2 || u.age < 16
}

function isTeamPickMatchType(type: MatchType): boolean {
  return (
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

export type LoginResult = {
  ok: boolean
  error?: string
  needsOnboarding?: boolean
  needsVenueOnboarding?: boolean
  isVenue?: boolean
  isAdmin?: boolean
}

type AppContextType = {
  authLoading: boolean
  currentUser: User | null
  isAuthenticated: boolean
  needsOnboarding: boolean
  needsVenueOnboarding: boolean
  login: (
    email: string,
    password: string,
    gender: Gender,
    isSignUp: boolean,
    whatsappPhone?: string
  ) => Promise<LoginResult>
  loginWithGoogle: (isSignUp: boolean) => Promise<LoginResult>
  resolveTeamPickPrivateJoinCode: (
    code: string
  ) => Promise<{ ok: boolean; matchId?: string; error?: string }>
  logout: () => Promise<void>
  matchOpportunities: MatchOpportunity[]
  users: User[]
  teams: Team[]
  teamInvites: TeamInvite[]
  teamJoinRequests: TeamJoinRequest[]
  rivalChallenges: RivalChallenge[]
  participatingOpportunityIds: string[]
  venueForOwner: SportsVenue | null
  onboardingSource: 'registration' | 'profile_edit'
  openProfileEditor: () => void
  exitProfileEditor: () => void
  completeOnboarding: (
    data: OnboardingData
  ) => Promise<{ ok: boolean; error?: string }>
  completeVenueOnboarding: (
    data: VenueOnboardingData
  ) => Promise<{ ok: boolean; error?: string }>
  /** Refresca oportunidades y participaciones desde Supabase (jugador). */
  refreshMatchData: () => Promise<void>
  joinMatchOpportunity: (
    opportunityId: string,
    options?: {
      isGoalkeeper?: boolean
      teamPickTeam?: 'A' | 'B'
      teamPickRole?: 'gk' | 'defensa' | 'mediocampista' | 'delantero'
      teamPickJoinCode?: string
    }
  ) => Promise<JoinMatchResult>
  respondToMatchInvitation: (
    opportunityId: string,
    accept: boolean
  ) => Promise<{ ok: boolean; error?: string }>
  /** Organizador: cerrar partido (rival o casual). */
  finalizeMatchOpportunity: (
    opportunityId: string,
    outcome:
      | { kind: 'rival'; rivalResult: RivalResult }
      | { kind: 'casual' }
      | { kind: 'casual_scored'; result: RivalResult }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  suspendMatchOpportunity: (
    opportunityId: string,
    reason: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  /** Participante u organizador: una calificación por usuario (ventana 48 h). */
  submitMatchRating: (
    opportunityId: string,
    payload: {
      organizerRating: number | null
      matchRating: number
      levelRating: number
      comment?: string
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  getFilteredMatches: (gender: Gender) => MatchOpportunity[]
  getUserTeams: () => Team[]
  acceptRivalOpportunityWithTeam: (
    opportunityId: string,
    myTeamId: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  getFilteredTeams: (gender: Gender) => Team[]
  /** Otros jugadores del mismo género (excluye al usuario actual). */
  getFilteredUsers: (gender: Gender) => User[]
  addMatchOpportunity: (
    m: Omit<MatchOpportunity, 'id' | 'createdAt'> & {
      creatorIsGoalkeeper?: boolean
      bookCourtSlot?: boolean
      courtSlotMinutes?: number
    }
  ) => Promise<
    { ok: true } | { ok: false; code?: 'no_court'; error: string }
  >
  /** Crear partido selección de equipos (RPC `create_team_pick_match_opportunity`). */
  createTeamPickMatchOpportunity: (p: {
    type: 'team_pick_public' | 'team_pick_private'
    title: string
    description: string
    location: string
    venue: string
    cityId: string
    dateTime: Date
    level: Level
    gender: Gender
    sportsVenueId: string | null
    bookCourtSlot: boolean
    courtSlotMinutes: number
    creatorEncounterRole: TeamPickRole
    /** Hex 6 dígitos, ej. `#DC2626` (contrato BD `team_pick_color_*`). */
    teamPickColorA: string
    teamPickColorB: string
  }) => Promise<
    | { ok: true; joinCode?: string | null }
    | { ok: false; code?: 'no_court'; error: string }
  >
  reserveVenueOnly: (p: {
    sportsVenueId: string
    startsAt: Date
    durationMinutes: number
  }) => Promise<
    { ok: true } | { ok: false; code?: 'no_court'; error: string }
  >
  createRivalChallenge: (payload: {
    challengerTeam: Team
    mode: 'direct' | 'open'
    challengedTeam?: Team
    message?: string
    venue: string
    location: string
    dateTime: Date
    level: Level
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  /** Sube avatar y actualiza `profiles.photo_url` + estado local. */
  updateProfilePhoto: (
    uri: string,
    mimeType: string,
    fileSize?: number | null
  ) => Promise<{ ok: boolean; error?: string }>
  refreshTeamData: () => Promise<void>
  createTeam: (
    team: Omit<Team, 'id' | 'createdAt'>
  ) => Promise<{ ok: boolean; error?: string }>
  updateTeam: (
    teamId: string,
    updates: {
      name?: string
      description?: string | null
      logo?: string | null
    }
  ) => Promise<{ ok: boolean; error?: string }>
  deleteTeam: (teamId: string) => Promise<{ ok: boolean; error?: string }>
  leaveTeam: (teamId: string) => Promise<{ ok: boolean; error?: string }>
  updateTeamPrivateSettings: (
    teamId: string,
    payload: { whatsappInviteUrl?: string | null; rulesText?: string | null }
  ) => Promise<TeamPrivateSettings | null>
  inviteToTeam: (
    teamId: string,
    userId: string
  ) => Promise<{ ok: boolean; error?: string }>
  respondToInvite: (
    inviteId: string,
    accept: boolean
  ) => Promise<{ ok: boolean; error?: string }>
  requestToJoinTeam: (teamId: string) => Promise<{ ok: boolean; error?: string }>
  respondToJoinRequest: (
    requestId: string,
    accept: boolean
  ) => Promise<{ ok: boolean; error?: string }>
  cancelJoinRequest: (requestId: string) => Promise<{ ok: boolean; error?: string }>
  respondToRivalChallenge: (
    challengeId: string,
    accept: boolean,
    myTeamId?: string
  ) => Promise<{
    ok: boolean
    error?: string
    chatOpportunityId?: string
  }>
  teamsDetailFocusTeamId: string | null
  setTeamsDetailFocusTeamId: (id: string | null) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

function arraysEqualByKey<T>(
  a: T[],
  b: T[],
  getKey: (item: T) => string
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (getKey(a[i]) !== getKey(b[i])) return false
  }
  return true
}

function setArrayStateIfChanged<T>(
  setter: Dispatch<SetStateAction<T[]>>,
  next: T[],
  getKey: (item: T) => string
): void {
  setter((prev) => (arraysEqualByKey(prev, next, getKey) ? prev : next))
}

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo<SupabaseClient | null>(() => {
    if (!isSupabaseConfigured()) return null
    return createClient()
  }, [])

  const [authLoading, setAuthLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [matchOpportunities, setMatchOpportunities] = useState<
    MatchOpportunity[]
  >([])
  const [users, setUsers] = useState<User[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([])
  const [teamJoinRequests, setTeamJoinRequests] = useState<TeamJoinRequest[]>(
    []
  )
  const [rivalChallenges, setRivalChallenges] = useState<RivalChallenge[]>([])
  const [teamsDetailFocusTeamId, setTeamsDetailFocusTeamId] = useState<
    string | null
  >(null)
  const [participatingOpportunityIds, setParticipatingOpportunityIds] =
    useState<string[]>([])
  const [venueForOwner, setVenueForOwner] = useState<SportsVenue | null>(null)
  const [onboardingSource, setOnboardingSource] = useState<
    'registration' | 'profile_edit'
  >('registration')

  const setMatchOpportunitiesStable = useCallback((next: MatchOpportunity[]) => {
    setArrayStateIfChanged(setMatchOpportunities, next, (m) => m.id)
  }, [])
  const setUsersStable = useCallback((next: User[]) => {
    setArrayStateIfChanged(setUsers, next, (u) => u.id)
  }, [])
  const setTeamsStable = useCallback((next: Team[]) => {
    setArrayStateIfChanged(setTeams, next, (t) => t.id)
  }, [])
  const setTeamInvitesStable = useCallback((next: TeamInvite[]) => {
    setArrayStateIfChanged(setTeamInvites, next, (inv) => inv.id)
  }, [])
  const setTeamJoinRequestsStable = useCallback((next: TeamJoinRequest[]) => {
    setArrayStateIfChanged(setTeamJoinRequests, next, (req) => req.id)
  }, [])
  const setRivalChallengesStable = useCallback((next: RivalChallenge[]) => {
    setArrayStateIfChanged(setRivalChallenges, next, (c) => c.id)
  }, [])
  const setParticipatingOpportunityIdsStable = useCallback((next: string[]) => {
    setArrayStateIfChanged(setParticipatingOpportunityIds, next, (id) => id)
  }, [])

  const fetchAndSetPlayerData = useCallback(
    async (client: SupabaseClient, userId: string, profile: User) => {
      if (profile.accountType !== 'player') return
      const [
        matches,
        others,
        teamList,
        invites,
        joinReqs,
        partIds,
        challenges,
      ] = await Promise.all([
        fetchMatchOpportunities(client),
        fetchOtherProfiles(client, userId, profile.gender),
        fetchTeamsWithMembers(client),
        fetchTeamInvitesForUser(client, userId),
        fetchTeamJoinRequestsForUser(client, userId),
        fetchParticipatingOpportunityIds(client, userId),
        fetchRivalChallengesForUser(client, userId),
      ])
      setMatchOpportunitiesStable(matches)
      setUsersStable(others)
      setTeamsStable(teamList)
      setTeamInvitesStable(invites)
      setTeamJoinRequestsStable(joinReqs)
      setParticipatingOpportunityIdsStable(partIds)
      setRivalChallengesStable(challenges)
    },
    [
      setMatchOpportunitiesStable,
      setParticipatingOpportunityIdsStable,
      setRivalChallengesStable,
      setTeamInvitesStable,
      setTeamJoinRequestsStable,
      setTeamsStable,
      setUsersStable,
    ]
  )

  const clearLists = useCallback(() => {
    setMatchOpportunities([])
    setUsers([])
    setTeams([])
    setTeamInvites([])
    setTeamJoinRequests([])
    setRivalChallenges([])
    setParticipatingOpportunityIds([])
    setVenueForOwner(null)
  }, [])

  const hydrateFromSession = useCallback(
    async (client: SupabaseClient, session: Session | null) => {
      if (!session?.user) {
        setAnalyticsUser(null)
        setCurrentUser(null)
        clearLists()
        return
      }

      const authUser = session.user
      const email =
        authUser.email?.trim() || getAuthUserEmail(authUser)?.trim() || ''
      if (!email) {
        setAnalyticsUser(null)
        setCurrentUser(null)
        clearLists()
        return
      }

      const profile = await fetchProfileForUser(client, authUser.id, email)
      if (!profile) {
        setAnalyticsUser(null)
        setCurrentUser(null)
        clearLists()
        return
      }

      setCurrentUser(profile)
      setAnalyticsUser({ id: profile.id, email: profile.email })

      if (profile.accountType === 'admin') {
        clearLists()
        return
      }

      if (profile.accountType === 'venue') {
        clearLists()
        const venueRow = await fetchVenueForOwner(client, authUser.id)
        setVenueForOwner(venueRow)
        return
      }

      setVenueForOwner(null)
      await fetchAndSetPlayerData(client, authUser.id, profile)
    },
    [clearLists, fetchAndSetPlayerData]
  )

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    let mounted = true

    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      await hydrateFromSession(supabase, session)
      if (!mounted) return
      setAuthLoading(false)
    })()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        if (event === 'SIGNED_OUT') {
          setAnalyticsUser(null)
          setCurrentUser(null)
          clearLists()
          return
        }
        if (event === 'SIGNED_IN' && session) {
          await hydrateFromSession(supabase, session)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase, hydrateFromSession, clearLists])

  const login = useCallback(
    async (
      email: string,
      password: string,
      gender: Gender,
      isSignUp: boolean,
      whatsappPhone?: string
    ): Promise<LoginResult> => {
      if (!isSupabaseConfigured() || !supabase) {
        trackProductEvent(ProductEventNames.loginFailed, {
          userId: null,
          metadata: {
            method: 'email_password',
            is_signup: isSignUp,
            error_message: 'supabase_not_configured',
          },
        })
        return {
          ok: false,
          error:
            'Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env',
        }
      }
      try {
        const fail = (msg: string, extra?: Record<string, unknown>): LoginResult => {
          trackProductEvent(ProductEventNames.loginFailed, {
            userId: null,
            metadata: {
              method: 'email_password',
              is_signup: isSignUp,
              error_message: msg.slice(0, 400),
              ...extra,
            },
            supabase,
          })
          return { ok: false, error: msg }
        }
        const recordAuthSuccess = (profile: User) => {
          setAnalyticsUser({ id: profile.id, email: profile.email })
          trackProductEvent(ProductEventNames.loginSuccess, {
            userId: profile.id,
            metadata: {
              method: 'email_password',
              account_type: profile.accountType ?? 'player',
              is_signup: isSignUp,
            },
            supabase,
          })
          if (isSignUp) {
            trackProductEvent(ProductEventNames.signupSuccess, {
              userId: profile.id,
              metadata: {
                method: 'email_password',
                account_type: profile.accountType ?? 'player',
              },
              supabase,
            })
          }
        }
        const emailTrimmed = email.trim()
        if (isSignUp) {
          const whatsapp = whatsappPhone?.trim() ?? ''
          const { data, error } = await supabase.auth.signUp({
            email: emailTrimmed,
            password,
            options: {
              data: whatsapp ? { gender, whatsapp_phone: whatsapp } : { gender },
            },
          })
          if (error) return fail(formatAuthError(error))
          if (data.user && !data.session) {
            return fail(
              'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.',
              { reason: 'email_confirmation_pending' }
            )
          }
          if (data.user) {
            await supabase
              .from('profiles')
              .update({ gender, whatsapp_phone: whatsapp })
              .eq('id', data.user.id)
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({
            email: emailTrimmed,
            password,
          })
          if (error) return fail(formatAuthError(error))
        }

        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          return fail('No se pudo obtener la sesión.')
        }

        const userEmail = user.email ?? getAuthUserEmail(user)
        if (!userEmail) {
          return fail('No se pudo obtener la sesión.')
        }

        const profile = await fetchProfileForUser(supabase, user.id, userEmail)
        if (!profile) {
          return fail('No se encontró el perfil.')
        }

        setCurrentUser(profile)
        recordAuthSuccess(profile)

        if (profile.accountType === 'admin') {
          clearLists()
          return {
            ok: true,
            needsOnboarding: false,
            isVenue: false,
            isAdmin: true,
          }
        }

        if (profile.accountType === 'venue') {
          clearLists()
          const venueRow = await fetchVenueForOwner(supabase, user.id)
          setVenueForOwner(venueRow)
          return {
            ok: true,
            needsOnboarding: false,
            needsVenueOnboarding: !venueRow,
            isVenue: true,
          }
        }

        await fetchAndSetPlayerData(supabase, user.id, profile)
        setVenueForOwner(null)

        return {
          ok: true,
          needsOnboarding: needsOnboardingProfile(profile),
          isVenue: false,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error de conexión'
        trackProductEvent(ProductEventNames.loginFailed, {
          userId: null,
          metadata: {
            method: 'email_password',
            is_signup: isSignUp,
            error_message: msg.slice(0, 400),
            reason: 'exception',
          },
          supabase,
        })
        return { ok: false, error: msg }
      }
    },
    [supabase, clearLists, fetchAndSetPlayerData]
  )

  const loginWithGoogle = useCallback(
    async (isSignUp: boolean): Promise<LoginResult> => {
      if (!isSupabaseConfigured() || !supabase) {
        trackProductEvent(ProductEventNames.loginFailed, {
          userId: null,
          metadata: {
            method: 'google',
            is_signup: isSignUp,
            error_message: 'supabase_not_configured',
          },
        })
        return {
          ok: false,
          error:
            'Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env',
        }
      }
      try {
        const fail = (msg: string, extra?: Record<string, unknown>): LoginResult => {
          trackProductEvent(ProductEventNames.loginFailed, {
            userId: null,
            metadata: {
              method: 'google',
              is_signup: isSignUp,
              error_message: msg.slice(0, 400),
              ...extra,
            },
            supabase,
          })
          return { ok: false, error: msg }
        }
        const recordAuthSuccess = (profile: User) => {
          setAnalyticsUser({ id: profile.id, email: profile.email })
          trackProductEvent(ProductEventNames.loginSuccess, {
            userId: profile.id,
            metadata: {
              method: 'google',
              account_type: profile.accountType ?? 'player',
              is_signup: isSignUp,
            },
            supabase,
          })
          if (isSignUp) {
            trackProductEvent(ProductEventNames.signupSuccess, {
              userId: profile.id,
              metadata: {
                method: 'google',
                account_type: profile.accountType ?? 'player',
              },
              supabase,
            })
          }
        }
        // Debe ser exactamente la misma cadena que Supabase usará al redirigir y que
        // openAuthSessionAsync escucha; Linking.createURL('/auth/callback') en APK puede
        // diferir (p. ej. /--/) y entonces el navegador nunca devuelve los tokens.
        const redirectTo = nativeAuthCallbackUrl()
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            /**
             * En nativo, skipBrowserRedirect:true añade skip_http_redirect a la URL de
             * authorize; GoTrue puede responder de forma que Chrome Custom Tabs muestra
             * pantalla en blanco. En web seguimos en true para no hacer window.location.
             */
            skipBrowserRedirect: Platform.OS === 'web',
            queryParams: isSignUp ? { prompt: 'consent' } : undefined,
          },
        })
        if (error) return fail(formatAuthError(error))
        if (!data?.url) {
          return fail('No se pudo iniciar Google OAuth.')
        }

        let authCallbackUrl: string
        try {
          authCallbackUrl = await openOAuthAndResolveCallbackUrl(data.url, redirectTo)
        } catch (oauthErr) {
          const msg =
            oauthErr instanceof Error ? oauthErr.message : 'Error en login con Google.'
          return fail(msg, { oauth_step: 'browser_or_linking' })
        }

        if (isWebCallbackUrl(authCallbackUrl)) {
          return fail(
            `Google OAuth volvió al callback web (sportmatch.cl) en vez de la app. Ajusta Redirect URLs permitidas en Supabase para mobile (\`${redirectTo}\` y exp://.../--/auth/callback).`,
            { oauth_step: 'web_callback' }
          )
        }

        const { accessToken, refreshToken } =
          extractTokensFromRedirect(authCallbackUrl)
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionError) return fail(formatAuthError(sessionError))
        } else {
          const code = extractAuthCodeFromRedirect(authCallbackUrl)
          if (!code) {
            return fail(
              'No se recibieron credenciales del login con Google (ni tokens ni código). Reinstala la app o revisa la configuración OAuth.',
              { oauth_step: 'missing_tokens_and_code' }
            )
          }
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            return fail(formatAuthError(exchangeError), { oauth_step: 'exchange_code' })
          }
        }

        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          return fail('No se pudo obtener la sesión.')
        }

        const userEmail = user.email ?? getAuthUserEmail(user)
        if (!userEmail) {
          return fail('No se pudo obtener el email de la sesión.')
        }

        const profile = await fetchProfileForUser(supabase, user.id, userEmail)
        if (!profile) {
          return fail(
            'El usuario autenticó con Google, pero no existe perfil en la base. Revisa trigger/proceso de alta de perfiles en Supabase.',
            { reason: 'profile_missing' }
          )
        }

        setCurrentUser(profile)
        recordAuthSuccess(profile)

        if (profile.accountType === 'admin') {
          clearLists()
          return {
            ok: true,
            needsOnboarding: false,
            isVenue: false,
            isAdmin: true,
          }
        }

        if (profile.accountType === 'venue') {
          clearLists()
          const venueRow = await fetchVenueForOwner(supabase, user.id)
          setVenueForOwner(venueRow)
          return {
            ok: true,
            needsOnboarding: false,
            needsVenueOnboarding: !venueRow,
            isVenue: true,
          }
        }

        await fetchAndSetPlayerData(supabase, user.id, profile)
        setVenueForOwner(null)
        return {
          ok: true,
          needsOnboarding: needsOnboardingProfile(profile),
          isVenue: false,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error de conexión'
        trackProductEvent(ProductEventNames.loginFailed, {
          userId: null,
          metadata: {
            method: 'google',
            is_signup: isSignUp,
            error_message: msg.slice(0, 400),
            reason: 'exception',
          },
          supabase,
        })
        return { ok: false, error: msg }
      }
    },
    [supabase, clearLists, fetchAndSetPlayerData]
  )

  const resolveTeamPickPrivateJoinCode = useCallback(
    async (code: string): Promise<{ ok: boolean; matchId?: string; error?: string }> => {
      if (!isSupabaseConfigured() || !supabase) {
        return {
          ok: false,
          error:
            'Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env',
        }
      }
      const normalized = code.trim()
      if (!/^[0-9]{4}$/.test(normalized)) {
        return { ok: false, error: 'Ingresa un código de 4 dígitos.' }
      }
      const { data, error } = await supabase.rpc(
        'resolve_team_pick_private_join_code',
        { p_join_code: normalized }
      )
      if (error) return { ok: false, error: error.message }
      if (!data || typeof data !== 'object') {
        return { ok: false, error: 'Respuesta inválida al resolver código.' }
      }
      const row = data as { ok?: boolean; matchId?: string; error?: string }
      if (row.ok !== true || !row.matchId) {
        return { ok: false, error: row.error ?? 'Código no válido.' }
      }
      return { ok: true, matchId: row.matchId }
    },
    [supabase]
  )

  const openProfileEditor = useCallback(() => {
    setOnboardingSource('profile_edit')
  }, [])

  const exitProfileEditor = useCallback(() => {
    setOnboardingSource('registration')
  }, [])

  const completeOnboarding = useCallback(
    async (
      data: OnboardingData
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !isSupabaseConfigured() || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      if (currentUser.accountType !== 'player') {
        return { ok: false, error: 'Solo aplica a cuentas jugador.' }
      }
      const photo = data.photo || DEFAULT_AVATAR
      const { error } = await supabase
        .from('profiles')
        .update({
          name: data.name,
          age: data.age,
          gender: data.gender,
          whatsapp_phone: data.whatsappPhone.trim(),
          position: data.position,
          level: data.level,
          city: data.city,
          availability: data.availability,
          photo_url: photo,
        })
        .eq('id', currentUser.id)

      if (error) {
        return { ok: false, error: error.message }
      }

      const nextUser: User = {
        ...currentUser,
        ...data,
        whatsappPhone: data.whatsappPhone.trim(),
        photo,
        email: currentUser.email,
        createdAt: currentUser.createdAt,
      }
      setCurrentUser(nextUser)

      if (onboardingSource === 'profile_edit') {
        setOnboardingSource('registration')
        return { ok: true }
      }

      await fetchAndSetPlayerData(supabase, nextUser.id, nextUser)
      return { ok: true }
    },
    [currentUser, supabase, onboardingSource, fetchAndSetPlayerData]
  )

  const completeVenueOnboarding = useCallback(
    async (
      data: VenueOnboardingData
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !isSupabaseConfigured() || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      if (currentUser.accountType !== 'venue') {
        return { ok: false, error: 'Solo aplica a cuentas centro.' }
      }
      const existing = await fetchVenueForOwner(supabase, currentUser.id)
      if (existing) {
        setVenueForOwner(existing)
        return { ok: true }
      }
      const slot = Math.min(
        180,
        Math.max(15, Math.round(data.slotDurationMinutes) || 60)
      )
      const { error: insErr } = await supabase.from('sports_venues').insert({
        owner_id: currentUser.id,
        name: data.name.trim(),
        address: data.address.trim(),
        phone: data.phone.trim(),
        city: data.city.trim() || 'Rancagua',
        maps_url: data.mapsUrl?.trim() || null,
        slot_duration_minutes: slot,
      })
      if (insErr) {
        return { ok: false, error: insErr.message }
      }
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ name: data.name.trim() })
        .eq('id', currentUser.id)
      if (profErr) {
        return { ok: false, error: profErr.message }
      }
      const venueRow = await fetchVenueForOwner(supabase, currentUser.id)
      setVenueForOwner(venueRow)
      setCurrentUser({
        ...currentUser,
        name: data.name.trim(),
      })
      return { ok: true }
    },
    [currentUser, supabase]
  )

  const refreshMatchData = useCallback(async () => {
    if (!currentUser || !supabase || currentUser.accountType !== 'player') return
    const [partIds, matches] = await Promise.all([
      fetchParticipatingOpportunityIds(supabase, currentUser.id),
      fetchMatchOpportunities(supabase),
    ])
    setParticipatingOpportunityIdsStable(partIds)
    setMatchOpportunitiesStable(matches)
  }, [
    currentUser,
    setMatchOpportunitiesStable,
    setParticipatingOpportunityIdsStable,
    supabase,
  ])

  const finalizeMatchOpportunity = useCallback(
    async (
      opportunityId: string,
      outcome:
        | { kind: 'rival'; rivalResult: RivalResult }
        | { kind: 'casual' }
        | { kind: 'casual_scored'; result: RivalResult }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const opp = matchOpportunities.find((m) => m.id === opportunityId)
      if (!opp || opp.creatorId !== currentUser.id) {
        return { ok: false, error: 'Solo el organizador puede finalizar el partido.' }
      }
      if (opp.status === 'completed') {
        return { ok: false, error: 'Este partido ya está finalizado.' }
      }
      if (opp.type === 'rival' && outcome.kind !== 'rival') {
        return { ok: false, error: 'Indica el resultado del partido.' }
      }
      if (
        opp.type !== 'rival' &&
        outcome.kind !== 'casual' &&
        outcome.kind !== 'casual_scored'
      ) {
        return { ok: false, error: 'Tipo de partido no válido.' }
      }

      const now = new Date().toISOString()
      const { data: partRows, error: partErr } = await supabase
        .from('match_opportunity_participants')
        .select('user_id, status')
        .eq('opportunity_id', opportunityId)
      if (partErr) {
        return { ok: false, error: partErr.message }
      }
      const activeParticipants = (partRows ?? []).filter(
        (p) => p.status === 'pending' || p.status === 'confirmed'
      )
      const activeWithoutCreator = activeParticipants.filter(
        (p) => p.user_id !== currentUser.id
      )
      if (opp.type === 'rival' && activeWithoutCreator.length === 0) {
        return {
          ok: false,
          error: 'Debe existir al menos un rival confirmado para finalizar.',
        }
      }
      if ((opp.type === 'open' || isTeamPickMatchType(opp.type)) && activeParticipants.length < 2) {
        return {
          ok: false,
          error: 'Se requieren al menos 2 participantes activos para finalizar.',
        }
      }
      const update: Record<string, unknown> = {
        status: 'completed',
        finalized_at: now,
        updated_at: now,
      }
      if (opp.type === 'rival' && outcome.kind === 'rival') {
        update.rival_result = outcome.rivalResult
        update.casual_completed = null
      } else if (outcome.kind === 'casual_scored') {
        update.rival_result = outcome.result
        update.casual_completed = true
      } else {
        update.rival_result = null
        update.casual_completed = true
      }

      const { error } = await supabase
        .from('match_opportunities')
        .update(update)
        .eq('id', opportunityId)
        .eq('creator_id', currentUser.id)

      if (error) {
        return { ok: false, error: error.message }
      }

      const matches = await fetchMatchOpportunities(supabase)
      setMatchOpportunitiesStable(matches)
      return { ok: true }
    },
    [currentUser, supabase, matchOpportunities]
  )

  const suspendMatchOpportunity = useCallback(
    async (
      opportunityId: string,
      reason: string
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const opp = matchOpportunities.find((m) => m.id === opportunityId)
      if (!opp || opp.creatorId !== currentUser.id) {
        return { ok: false, error: 'Solo el organizador puede suspender el partido.' }
      }
      if (opp.status === 'completed') {
        return { ok: false, error: 'No puedes suspender un partido ya finalizado.' }
      }
      const cleanReason = reason.trim()
      if (cleanReason.length < 5) {
        return { ok: false, error: 'El motivo debe tener al menos 5 caracteres.' }
      }

      const now = new Date().toISOString()
      const { error } = await supabase
        .from('match_opportunities')
        .update({
          status: 'cancelled',
          suspended_at: now,
          suspended_reason: cleanReason,
          updated_at: now,
        })
        .eq('id', opportunityId)
        .eq('creator_id', currentUser.id)

      if (error) {
        return { ok: false, error: error.message }
      }

      const matches = await fetchMatchOpportunities(supabase)
      setMatchOpportunitiesStable(matches)
      return { ok: true }
    },
    [currentUser, supabase, matchOpportunities]
  )

  const submitMatchRating = useCallback(
    async (
      opportunityId: string,
      payload: {
        organizerRating: number | null
        matchRating: number
        levelRating: number
        comment?: string
      }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const { error } = await supabase.from('match_opportunity_ratings').insert({
        opportunity_id: opportunityId,
        rater_id: currentUser.id,
        organizer_rating: payload.organizerRating,
        match_rating: payload.matchRating,
        level_rating: payload.levelRating,
        comment: payload.comment?.trim() || null,
      })

      if (error) {
        return { ok: false, error: error.message }
      }
      return { ok: true }
    },
    [currentUser, supabase]
  )

  const updateProfilePhoto = useCallback(
    async (
      uri: string,
      mimeType: string,
      fileSize?: number | null
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase || currentUser.accountType !== 'player') {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const up = await uploadProfileAvatarFromUri(
        supabase,
        currentUser.id,
        uri,
        mimeType,
        fileSize ?? null
      )
      if ('error' in up) return { ok: false, error: up.error }
      const { error } = await supabase
        .from('profiles')
        .update({ photo_url: up.publicUrl })
        .eq('id', currentUser.id)
      if (error) return { ok: false, error: error.message }
      setCurrentUser({ ...currentUser, photo: up.publicUrl })
      return { ok: true }
    },
    [currentUser, supabase]
  )

  const matchesByGender = useMemo(
    () => ({
      male: matchOpportunities.filter((m) => m.gender === 'male'),
      female: matchOpportunities.filter((m) => m.gender === 'female'),
    }),
    [matchOpportunities]
  )

  const myTeams = useMemo(() => {
    if (!currentUser) return [] as Team[]
    return teams.filter(
      (t) =>
        t.captainId === currentUser.id ||
        t.members.some((m) => m.id === currentUser.id)
    )
  }, [teams, currentUser])

  const teamsByGender = useMemo(
    () => ({
      male: teams.filter((t) => t.gender === 'male'),
      female: teams.filter((t) => t.gender === 'female'),
    }),
    [teams]
  )

  const usersByGender = useMemo(
    () => ({
      male: users.filter((u) => u.gender === 'male' && u.id !== currentUser?.id),
      female: users.filter(
        (u) => u.gender === 'female' && u.id !== currentUser?.id
      ),
    }),
    [users, currentUser?.id]
  )

  const getFilteredMatches = useCallback(
    (gender: Gender) => matchesByGender[gender],
    [matchesByGender]
  )

  const getUserTeams = useCallback(() => myTeams, [myTeams])

  const acceptRivalOpportunityWithTeam = useCallback(
    async (
      opportunityId: string,
      myTeamId: string
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const challenge = rivalChallenges.find(
        (c) => c.opportunityId === opportunityId && c.status === 'pending'
      )
      if (!challenge) {
        return {
          ok: false,
          error: 'No hay un desafío pendiente para este partido.',
        }
      }

      let acceptedTeamId = challenge.challengedTeamId
      if (challenge.mode === 'open') {
        acceptedTeamId = myTeamId
      }
      if (!acceptedTeamId) {
        return { ok: false, error: 'No se pudo determinar el equipo aceptado.' }
      }

      const acceptedTeam = teams.find((t) => t.id === acceptedTeamId)
      const challengerTeam = teams.find(
        (t) => t.id === challenge.challengerTeamId
      )
      const updatePayload: Record<string, unknown> = {
        status: 'accepted',
        responded_at: new Date().toISOString(),
        accepted_team_id: acceptedTeamId,
        accepted_captain_id: currentUser.id,
      }
      if (challenge.mode === 'open') {
        updatePayload.challenged_team_id = acceptedTeamId
        updatePayload.challenged_captain_id = currentUser.id
      }

      const { error: updErr } = await supabase
        .from('rival_challenges')
        .update(updatePayload)
        .eq('id', challenge.id)
      if (updErr) {
        return { ok: false, error: updErr.message }
      }

      await supabase
        .from('match_opportunities')
        .update({
          status: 'confirmed',
          title:
            challengerTeam && acceptedTeam
              ? `${challengerTeam.name} vs ${acceptedTeam.name}`
              : challenge.opportunityTitle,
        })
        .eq('id', challenge.opportunityId)

      await supabase.from('match_opportunity_participants').upsert({
        opportunity_id: challenge.opportunityId,
        user_id: currentUser.id,
        status: 'confirmed',
        is_goalkeeper: false,
      })

      const [freshChallenges, matches, partIds] = await Promise.all([
        fetchRivalChallengesForUser(supabase, currentUser.id),
        fetchMatchOpportunities(supabase),
        fetchParticipatingOpportunityIds(supabase, currentUser.id),
      ])
      setRivalChallengesStable(freshChallenges)
      setMatchOpportunitiesStable(matches)
      setParticipatingOpportunityIdsStable(partIds)

      return { ok: true }
    },
    [currentUser, supabase, rivalChallenges, teams]
  )

  const joinMatchOpportunity = useCallback(
    async (
      opportunityId: string,
      options?: {
        isGoalkeeper?: boolean
        teamPickTeam?: 'A' | 'B'
        teamPickRole?: 'gk' | 'defensa' | 'mediocampista' | 'delantero'
        teamPickJoinCode?: string
      }
    ): Promise<JoinMatchResult> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const opp = matchOpportunities.find((m) => m.id === opportunityId)
      if (!opp) {
        return { ok: false, error: 'No encontramos este partido.' }
      }
      if (isTeamPickMatchType(opp.type)) {
        const hasTeam = teams.some(
          (t) =>
            t.captainId === currentUser.id ||
            t.members.some((m) => m.id === currentUser.id)
        )
        if (!hasTeam) {
          return {
            ok: false,
            error: 'Para team pick debes pertenecer a un equipo.',
          }
        }
      }
      const result = await joinMatchOpportunityAction(
        supabase,
        currentUser,
        opp,
        participatingOpportunityIds,
        options
      )
      if (result.ok) {
        trackProductEvent(ProductEventNames.matchJoinSuccess, {
          userId: currentUser.id,
          metadata: {
            source: 'direct_join',
            opportunity_id: opportunityId,
            match_type: opp.type,
          },
          supabase,
        })
        const [partIds, matches] = await Promise.all([
          fetchParticipatingOpportunityIds(supabase, currentUser.id),
          fetchMatchOpportunities(supabase),
        ])
        setParticipatingOpportunityIdsStable(partIds)
        setMatchOpportunitiesStable(matches)
      }
      return result
    },
    [currentUser, supabase, matchOpportunities, participatingOpportunityIds, teams]
  )

  const respondToMatchInvitation = useCallback(
    async (
      opportunityId: string,
      accept: boolean
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const opp = matchOpportunities.find((m) => m.id === opportunityId)
      if (!opp) {
        return { ok: false, error: 'No encontramos este partido.' }
      }

      const { data: invitedRow, error: invitedErr } = await supabase
        .from('match_opportunity_participants')
        .select('status, is_goalkeeper')
        .eq('opportunity_id', opportunityId)
        .eq('user_id', currentUser.id)
        .maybeSingle()

      if (invitedErr) return { ok: false, error: invitedErr.message }
      if (!invitedRow || invitedRow.status !== 'invited') {
        return { ok: false, error: 'No existe una invitación pendiente.' }
      }
      if (accept && isTeamPickMatchType(opp.type)) {
        const hasTeam = teams.some(
          (t) =>
            t.captainId === currentUser.id ||
            t.members.some((m) => m.id === currentUser.id)
        )
        if (!hasTeam) {
          return {
            ok: false,
            error: 'Para team pick debes pertenecer a un equipo.',
          }
        }
      }

      let invitationAccepted = false
      if (!accept) {
        const { error } = await supabase
          .from('match_opportunity_participants')
          .update({ status: 'cancelled' })
          .eq('opportunity_id', opportunityId)
          .eq('user_id', currentUser.id)
          .eq('status', 'invited')
        if (error) return { ok: false, error: error.message }
      } else {
        const cap = opp.playersNeeded ?? 0
        if (cap > 0) {
          const { data: partRows, error: partErr } = await supabase
            .from('match_opportunity_participants')
            .select('user_id, status, is_goalkeeper')
            .eq('opportunity_id', opportunityId)
          if (partErr) return { ok: false, error: partErr.message }

          const activeRows = (partRows ?? []).filter(
            (p) =>
              p.status === 'pending' || p.status === 'confirmed' || p.status === 'creator'
          )
          const activeWithoutMe = activeRows.filter(
            (p) => p.user_id !== currentUser.id
          )
          const joinedDb = activeWithoutMe.length
          if (joinedDb >= cap) {
            return { ok: false, error: 'No quedan cupos en este partido.' }
          }

          if (opp.type === 'players') {
            const rules = playersJoinRules(opp)
            const gkCount = activeWithoutMe.filter((p) => p.is_goalkeeper === true).length
            const fieldCount = activeWithoutMe.length - gkCount
            const invitedAsGk = invitedRow.is_goalkeeper === true

            if (rules.kind === 'gk_only') {
              if (!invitedAsGk) {
                return {
                  ok: false,
                  error: 'Esta invitación no coincide con un cupo de arquero.',
                }
              }
              if (gkCount >= rules.max) {
                return { ok: false, error: 'Ya no quedan cupos de arquero.' }
              }
            } else if (rules.kind === 'field_only') {
              if (invitedAsGk) {
                return {
                  ok: false,
                  error: 'Esta invitación no coincide con un cupo de campo.',
                }
              }
              if (fieldCount >= rules.max) {
                return { ok: false, error: 'No quedan cupos de jugador de campo.' }
              }
            } else if (rules.kind === 'mixed') {
              if (invitedAsGk) {
                if (gkCount >= 1) {
                  return { ok: false, error: 'Ya hay un arquero confirmado.' }
                }
              } else if (fieldCount >= rules.maxField) {
                return { ok: false, error: 'No quedan cupos de jugador de campo.' }
              }
            }
          }
        }

        const { error } = await supabase
          .from('match_opportunity_participants')
          .update({ status: 'confirmed' })
          .eq('opportunity_id', opportunityId)
          .eq('user_id', currentUser.id)
          .eq('status', 'invited')
        if (error) return { ok: false, error: error.message }
        invitationAccepted = true
      }

      const [partIds, matches] = await Promise.all([
        fetchParticipatingOpportunityIds(supabase, currentUser.id),
        fetchMatchOpportunities(supabase),
      ])
      setParticipatingOpportunityIdsStable(partIds)
      setMatchOpportunitiesStable(matches)
      if (invitationAccepted) {
        trackProductEvent(ProductEventNames.matchJoinSuccess, {
          userId: currentUser.id,
          metadata: {
            source: 'invitation_accept',
            opportunity_id: opportunityId,
            match_type: opp.type,
          },
          supabase,
        })
      }
      return { ok: true }
    },
    [currentUser, supabase, matchOpportunities, teams]
  )

  const getFilteredTeams = useCallback(
    (gender: Gender) => teamsByGender[gender],
    [teamsByGender]
  )

  const getFilteredUsers = useCallback(
    (gender: Gender) => usersByGender[gender],
    [usersByGender]
  )

  const refreshTeamData = useCallback(async () => {
    if (!currentUser || !supabase || currentUser.accountType !== 'player') return
    const [teamList, invites, joinReqs, challenges] = await Promise.all([
      fetchTeamsWithMembers(supabase),
      fetchTeamInvitesForUser(supabase, currentUser.id),
      fetchTeamJoinRequestsForUser(supabase, currentUser.id),
      fetchRivalChallengesForUser(supabase, currentUser.id),
    ])
    setTeamsStable(teamList)
    setTeamInvitesStable(invites)
    setTeamJoinRequestsStable(joinReqs)
    setRivalChallengesStable(challenges)
  }, [
    currentUser,
    setRivalChallengesStable,
    setTeamInvitesStable,
    setTeamJoinRequestsStable,
    setTeamsStable,
    supabase,
  ])

  const createTeam = useCallback(
    async (
      team: Omit<Team, 'id' | 'createdAt'>
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const { data: teamRow, error } = await supabase
        .from('teams')
        .insert({
          name: team.name,
          logo_url: team.logo ?? null,
          level: team.level,
          captain_id: team.captainId,
          city: team.city,
          gender: team.gender,
          description: team.description ?? null,
        })
        .select('*')
        .single()

      if (error) {
        if (isTeamLimitReached(error)) {
          return { ok: false, error: 'Llegaste al máximo de 3 equipos.' }
        }
        return { ok: false, error: error.message }
      }

      const captain =
        team.members.find((m) => m.id === currentUser.id) ?? team.members[0]
      if (!captain) {
        return { ok: false, error: 'No se pudo determinar el capitán del equipo.' }
      }

      const { error: memErr } = await supabase.from('team_members').insert({
        team_id: teamRow.id,
        user_id: captain.id,
        position: captain.position,
        photo_url: captain.photo,
        status: 'confirmed',
      })

      if (memErr) {
        if (isTeamLimitReached(memErr)) {
          return { ok: false, error: 'Llegaste al máximo de 3 equipos.' }
        }
        return { ok: false, error: memErr.message }
      }

      await refreshTeamData()
      return { ok: true }
    },
    [currentUser, supabase, refreshTeamData]
  )

  const updateTeam = useCallback(
    async (
      teamId: string,
      updates: {
        name?: string
        description?: string | null
        logo?: string | null
      }
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const row: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (updates.name !== undefined) {
        const n = updates.name.trim()
        if (n.length < 2) {
          return {
            ok: false,
            error: 'El nombre del equipo debe tener al menos 2 caracteres.',
          }
        }
        row.name = n
      }
      if (updates.description !== undefined) {
        const d =
          updates.description === null
            ? ''
            : String(updates.description).trim()
        row.description = d.length > 0 ? d : null
      }
      if (updates.logo !== undefined) {
        row.logo_url = updates.logo
      }

      const { error } = await supabase
        .from('teams')
        .update(row)
        .eq('id', teamId)
        .eq('captain_id', currentUser.id)

      if (error) return { ok: false, error: error.message }
      await refreshTeamData()
      return { ok: true }
    },
    [currentUser, supabase, refreshTeamData]
  )

  const deleteTeam = useCallback(
    async (teamId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const team = teams.find((t) => t.id === teamId)
      if (!team || team.captainId !== currentUser.id) {
        return { ok: false, error: 'Solo el capitán puede eliminar el equipo.' }
      }
      const { error } = await supabase.from('teams').delete().eq('id', teamId)
      if (error) return { ok: false, error: error.message }
      await refreshTeamData()
      return { ok: true }
    },
    [currentUser, supabase, teams, refreshTeamData]
  )

  const leaveTeam = useCallback(
    async (teamId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const team = teams.find((t) => t.id === teamId)
      if (team?.captainId === currentUser.id) {
        return {
          ok: false,
          error: 'El capitán no puede retirarse; debe eliminar el equipo.',
        }
      }
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', currentUser.id)
      if (error) return { ok: false, error: error.message }
      await refreshTeamData()
      return { ok: true }
    },
    [currentUser, supabase, teams, refreshTeamData]
  )

  const updateTeamPrivateSettings = useCallback(
    async (
      teamId: string,
      payload: { whatsappInviteUrl?: string | null; rulesText?: string | null }
    ): Promise<TeamPrivateSettings | null> => {
      if (!currentUser || !supabase) return null
      const team = teams.find((t) => t.id === teamId)
      if (!team || team.captainId !== currentUser.id) return null

      const { data: cur } = await supabase
        .from('team_private_settings')
        .select('whatsapp_invite_url, rules_text')
        .eq('team_id', teamId)
        .maybeSingle()

      const nextWhatsapp =
        payload.whatsappInviteUrl !== undefined
          ? payload.whatsappInviteUrl?.trim() || null
          : ((cur?.whatsapp_invite_url as string | null) ?? null)
      const nextRules =
        payload.rulesText !== undefined
          ? payload.rulesText?.trim() || null
          : ((cur?.rules_text as string | null) ?? null)

      const { error } = await supabase.from('team_private_settings').upsert(
        {
          team_id: teamId,
          whatsapp_invite_url: nextWhatsapp,
          rules_text: nextRules,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'team_id' }
      )

      if (error) return null
      return {
        teamId,
        whatsappInviteUrl: nextWhatsapp,
        rulesText: nextRules,
      }
    },
    [currentUser, supabase, teams]
  )

  const inviteToTeam = useCallback(
    async (
      teamId: string,
      userId: string
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const { error } = await supabase.from('team_invites').insert({
        team_id: teamId,
        inviter_id: currentUser.id,
        invitee_id: userId,
        status: 'pending',
      })
      if (error) {
        return {
          ok: false,
          error:
            error.code === '23505'
              ? 'Ya existe una invitación pendiente para este jugador.'
              : error.message,
        }
      }
      const invites = await fetchTeamInvitesForUser(supabase, currentUser.id)
      setTeamInvitesStable(invites)
      return { ok: true }
    },
    [currentUser, supabase]
  )

  const respondToInvite = useCallback(
    async (
      inviteId: string,
      accept: boolean
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const invite = teamInvites.find((i) => i.id === inviteId)
      if (!invite) return { ok: false, error: 'Invitación no encontrada.' }

      if (accept) {
        const { error: memErr } = await supabase.from('team_members').insert({
          team_id: invite.teamId,
          user_id: currentUser.id,
          position: currentUser.position,
          photo_url: currentUser.photo,
          status: 'confirmed',
        })
        if (memErr) {
          if (isTeamLimitReached(memErr)) {
            return { ok: false, error: 'Llegaste al máximo de 3 equipos.' }
          }
          return { ok: false, error: memErr.message }
        }
        const { error: updErr } = await supabase
          .from('team_invites')
          .update({ status: 'accepted' })
          .eq('id', inviteId)
        if (updErr) return { ok: false, error: updErr.message }
      } else {
        const { error } = await supabase
          .from('team_invites')
          .update({ status: 'declined' })
          .eq('id', inviteId)
        if (error) return { ok: false, error: error.message }
      }

      await refreshTeamData()
      return { ok: true }
    },
    [currentUser, supabase, teamInvites, refreshTeamData]
  )

  const requestToJoinTeam = useCallback(
    async (teamId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const { error } = await supabase.from('team_join_requests').insert({
        team_id: teamId,
        requester_id: currentUser.id,
        status: 'pending',
      })
      if (error) {
        return {
          ok: false,
          error:
            error.code === '23505'
              ? 'Ya tienes una solicitud pendiente para este equipo.'
              : error.message,
        }
      }
      const list = await fetchTeamJoinRequestsForUser(supabase, currentUser.id)
      setTeamJoinRequestsStable(list)
      return { ok: true }
    },
    [currentUser, supabase]
  )

  const respondToJoinRequest = useCallback(
    async (
      requestId: string,
      accept: boolean
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const req = teamJoinRequests.find((r) => r.id === requestId)
      if (!req || req.status !== 'pending') {
        return { ok: false, error: 'Solicitud no disponible.' }
      }
      const team = teams.find((t) => t.id === req.teamId)
      if (!team || team.captainId !== currentUser.id) {
        return { ok: false, error: 'Solo el capitán puede responder.' }
      }

      if (!accept) {
        const { error } = await supabase
          .from('team_join_requests')
          .update({ status: 'declined', updated_at: new Date().toISOString() })
          .eq('id', requestId)
        if (error) return { ok: false, error: error.message }
        const list = await fetchTeamJoinRequestsForUser(supabase, currentUser.id)
        setTeamJoinRequestsStable(list)
        return { ok: true }
      }

      if (team.members.length >= 18) {
        return { ok: false, error: 'La plantilla ya está completa (18 jugadores).' }
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('position, photo_url')
        .eq('id', req.requesterId)
        .single()

      if (profErr || !prof) {
        return { ok: false, error: 'No se pudo cargar el perfil del jugador.' }
      }

      const { error: memErr } = await supabase.from('team_members').insert({
        team_id: req.teamId,
        user_id: req.requesterId,
        position: prof.position,
        photo_url: (prof.photo_url as string) || DEFAULT_AVATAR,
        status: 'confirmed',
      })
      if (memErr) {
        if (isTeamLimitReached(memErr)) {
          return { ok: false, error: 'Llegaste al máximo de 3 equipos.' }
        }
        return { ok: false, error: memErr.message }
      }

      const { error: updErr } = await supabase
        .from('team_join_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', requestId)
      if (updErr) return { ok: false, error: updErr.message }

      await refreshTeamData()
      return { ok: true }
    },
    [currentUser, supabase, teamJoinRequests, teams, refreshTeamData]
  )

  const cancelJoinRequest = useCallback(
    async (requestId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const req = teamJoinRequests.find((r) => r.id === requestId)
      if (!req || req.requesterId !== currentUser.id || req.status !== 'pending') {
        return { ok: false, error: 'Solicitud no válida.' }
      }
      const { error } = await supabase
        .from('team_join_requests')
        .delete()
        .eq('id', requestId)
      if (error) return { ok: false, error: error.message }
      const list = await fetchTeamJoinRequestsForUser(supabase, currentUser.id)
      setTeamJoinRequestsStable(list)
      return { ok: true }
    },
    [currentUser, supabase, teamJoinRequests]
  )

  const respondToRivalChallenge = useCallback(
    async (
      challengeId: string,
      accept: boolean,
      myTeamId?: string
    ): Promise<{
      ok: boolean
      error?: string
      chatOpportunityId?: string
    }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const challenge = rivalChallenges.find((c) => c.id === challengeId)
      if (!challenge || challenge.status !== 'pending') {
        return { ok: false, error: 'Desafío no disponible.' }
      }

      if (!accept) {
        const { error } = await supabase
          .from('rival_challenges')
          .update({
            status: 'declined',
            responded_at: new Date().toISOString(),
            accepted_team_id: null,
            accepted_captain_id: currentUser.id,
          })
          .eq('id', challengeId)
        if (error) return { ok: false, error: error.message }
        await refreshTeamData()
        await refreshMatchData()
        return { ok: true }
      }

      let acceptedTeamId = challenge.challengedTeamId
      if (challenge.mode === 'open') {
        if (!myTeamId) {
          return {
            ok: false,
            error: 'Selecciona tu equipo para aceptar este desafío.',
          }
        }
        acceptedTeamId = myTeamId
      }

      const acceptedTeam = teams.find((t) => t.id === acceptedTeamId)
      const challengerTeam = teams.find((t) => t.id === challenge.challengerTeamId)
      const updatePayload: Record<string, unknown> = {
        status: 'accepted',
        responded_at: new Date().toISOString(),
        accepted_team_id: acceptedTeamId,
        accepted_captain_id: currentUser.id,
      }
      if (challenge.mode === 'open') {
        updatePayload.challenged_team_id = acceptedTeamId
        updatePayload.challenged_captain_id = currentUser.id
      }

      const { error: updErr } = await supabase
        .from('rival_challenges')
        .update(updatePayload)
        .eq('id', challengeId)
      if (updErr) return { ok: false, error: updErr.message }

      await supabase
        .from('match_opportunities')
        .update({
          status: 'confirmed',
          title:
            challengerTeam && acceptedTeam
              ? `${challengerTeam.name} vs ${acceptedTeam.name}`
              : challenge.opportunityTitle,
        })
        .eq('id', challenge.opportunityId)

      await supabase.from('match_opportunity_participants').upsert({
        opportunity_id: challenge.opportunityId,
        user_id: currentUser.id,
        status: 'confirmed',
        is_goalkeeper: false,
      })

      const [freshChallenges, matches, partIds] = await Promise.all([
        fetchRivalChallengesForUser(supabase, currentUser.id),
        fetchMatchOpportunities(supabase),
        fetchParticipatingOpportunityIds(supabase, currentUser.id),
      ])
      setRivalChallengesStable(freshChallenges)
      setMatchOpportunitiesStable(matches)
      setParticipatingOpportunityIdsStable(partIds)

      trackProductEvent(ProductEventNames.matchJoinSuccess, {
        userId: currentUser.id,
        metadata: {
          source: 'rival_accept',
          opportunity_id: challenge.opportunityId,
          match_type: 'rival',
        },
        supabase,
      })

      return { ok: true, chatOpportunityId: challenge.opportunityId }
    },
    [
      currentUser,
      supabase,
      rivalChallenges,
      teams,
      refreshTeamData,
      refreshMatchData,
    ]
  )

  const addMatchOpportunity = useCallback(
    async (
      m: Omit<MatchOpportunity, 'id' | 'createdAt'> & {
        creatorIsGoalkeeper?: boolean
        bookCourtSlot?: boolean
        courtSlotMinutes?: number
      }
    ): Promise<
      { ok: true } | { ok: false; code?: 'no_court'; error: string }
    > => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }

      let reservationId: string | null = null
      if (
        m.sportsVenueId &&
        m.bookCourtSlot === true &&
        m.type !== 'rival'
      ) {
        const dur = m.courtSlotMinutes ?? 60
        const end = new Date(m.dateTime.getTime() + dur * 60 * 1000)
        const { data: resRpc, error: rpcErr } = await supabase.rpc(
          'book_venue_slot',
          {
            p_venue_id: m.sportsVenueId,
            p_starts_at: m.dateTime.toISOString(),
            p_ends_at: end.toISOString(),
          }
        )
        if (rpcErr) {
          if (rpcErr.message.includes('no_court')) {
            return {
              ok: false,
              code: 'no_court',
              error:
                'No hay cancha libre en ese horario en este centro.',
            }
          }
          return { ok: false, error: rpcErr.message }
        }
        reservationId = resRpc as string
      }

      const insert: Record<string, unknown> = {
        type: m.type,
        title: m.title,
        description: m.description ?? null,
        location: m.location,
        venue: m.venue,
        date_time: m.dateTime.toISOString(),
        level: m.level,
        creator_id: m.creatorId,
        team_name: m.teamName ?? null,
        players_needed: m.playersNeeded ?? null,
        players_joined: m.playersJoined ?? 0,
        players_seek_profile:
          m.type === 'players' && m.playersSeekProfile
            ? m.playersSeekProfile
            : null,
        gender: m.gender,
        status: m.status,
        sports_venue_id: m.sportsVenueId ?? null,
        venue_reservation_id: reservationId,
      }
      const { data, error } = await supabase
        .from('match_opportunities')
        .insert(insert)
        .select('*')
        .single()

      if (error) {
        return { ok: false, error: error.message }
      }

      const row = data as MatchOpportunityRow
      const oppId = row.id

      if (reservationId) {
        await supabase
          .from('venue_reservations')
          .update({ match_opportunity_id: oppId })
          .eq('id', reservationId)
      }

      if (m.type === 'open') {
        const { error: partErr } = await supabase
          .from('match_opportunity_participants')
          .insert({
            opportunity_id: oppId,
            user_id: currentUser.id,
            status: 'confirmed',
            is_goalkeeper: m.creatorIsGoalkeeper === true,
          })
        if (partErr) {
          await supabase.from('match_opportunities').delete().eq('id', oppId)
          return { ok: false, error: partErr.message }
        }
      }

      const [matches, partIds] = await Promise.all([
        fetchMatchOpportunities(supabase),
        fetchParticipatingOpportunityIds(supabase, currentUser.id),
      ])
      setMatchOpportunitiesStable(matches)
      setParticipatingOpportunityIdsStable(partIds)
      trackProductEvent(ProductEventNames.matchCreateSuccess, {
        userId: currentUser.id,
        metadata: {
          match_type: m.type,
          opportunity_id: oppId,
          booked_venue: Boolean(reservationId),
        },
        supabase,
      })
      if (reservationId) {
        trackProductEvent(ProductEventNames.bookingSuccess, {
          userId: currentUser.id,
          metadata: {
            context: 'match_create',
            reservation_id: reservationId,
            opportunity_id: oppId,
          },
          supabase,
        })
      }
      return { ok: true }
    },
    [currentUser, supabase]
  )

  const createTeamPickMatchOpportunity = useCallback(
    async (p: {
      type: 'team_pick_public' | 'team_pick_private'
      title: string
      description: string
      location: string
      venue: string
      cityId: string
      dateTime: Date
      level: Level
      gender: Gender
      sportsVenueId: string | null
      bookCourtSlot: boolean
      courtSlotMinutes: number
      creatorEncounterRole: TeamPickRole
      teamPickColorA: string
      teamPickColorB: string
    }): Promise<
      | { ok: true; joinCode?: string | null }
      | { ok: false; code?: 'no_court'; error: string }
    > => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }

      const { data: raw, error: rpcErr } = await supabase.rpc(
        'create_team_pick_match_opportunity',
        {
          p_type: p.type,
          p_title: p.title,
          p_description: p.description ?? '',
          p_location: p.location,
          p_venue: p.venue,
          p_city_id: p.cityId,
          p_date_time: p.dateTime.toISOString(),
          p_level: p.level,
          p_gender: p.gender,
          p_status: 'pending',
          p_sports_venue_id: p.sportsVenueId,
          p_book_court_slot: p.bookCourtSlot,
          p_court_slot_minutes: p.courtSlotMinutes,
          p_creator_encounter_role: p.creatorEncounterRole,
          p_team_pick_color_a: p.teamPickColorA,
          p_team_pick_color_b: p.teamPickColorB,
        }
      )

      if (rpcErr) {
        const msg = rpcErr.message ?? ''
        if (msg.includes('no_court')) {
          return { ok: false, code: 'no_court', error: msg }
        }
        return { ok: false, error: msg }
      }

      const body = raw as {
        ok?: boolean
        error?: string
        joinCode?: string | null
      } | null
      if (!body || body.ok !== true) {
        const err =
          typeof body?.error === 'string' ? body.error : 'No se pudo crear el partido.'
        if (err === 'no_court' || err.includes('no_court')) {
          return {
            ok: false,
            code: 'no_court',
            error: 'No hay cancha libre en ese horario en este centro.',
          }
        }
        return { ok: false, error: err }
      }

      const [matches, partIds] = await Promise.all([
        fetchMatchOpportunities(supabase),
        fetchParticipatingOpportunityIds(supabase, currentUser.id),
      ])
      setMatchOpportunitiesStable(matches)
      setParticipatingOpportunityIdsStable(partIds)

      trackProductEvent(ProductEventNames.matchCreateSuccess, {
        userId: currentUser.id,
        metadata: {
          match_type: p.type,
          team_pick: true,
          booked_venue: p.bookCourtSlot,
        },
        supabase,
      })
      if (p.bookCourtSlot) {
        trackProductEvent(ProductEventNames.bookingSuccess, {
          userId: currentUser.id,
          metadata: { context: 'team_pick_create', match_type: p.type },
          supabase,
        })
      }

      return {
        ok: true,
        joinCode:
          typeof body.joinCode === 'string' ? body.joinCode : null,
      }
    },
    [currentUser, supabase]
  )

  const reserveVenueOnly = useCallback(
    async ({
      sportsVenueId,
      startsAt,
      durationMinutes,
    }: {
      sportsVenueId: string
      startsAt: Date
      durationMinutes: number
    }): Promise<
      { ok: true } | { ok: false; code?: 'no_court'; error: string }
    > => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const end = new Date(startsAt.getTime() + durationMinutes * 60 * 1000)
      const { error } = await supabase.rpc('book_venue_slot', {
        p_venue_id: sportsVenueId,
        p_starts_at: startsAt.toISOString(),
        p_ends_at: end.toISOString(),
      })
      if (error) {
        if (error.message.includes('no_court')) {
          return {
            ok: false,
            code: 'no_court',
            error:
              'No hay cancha libre en ese horario en este centro.',
          }
        }
        return { ok: false, error: error.message }
      }
      trackProductEvent(ProductEventNames.bookingSuccess, {
        userId: currentUser.id,
        metadata: {
          context: 'venue_only',
          venue_id: sportsVenueId,
        },
        supabase,
      })
      return { ok: true }
    },
    [currentUser, supabase]
  )

  const createRivalChallenge = useCallback(
    async (payload: {
      challengerTeam: Team
      mode: 'direct' | 'open'
      challengedTeam?: Team
      message?: string
      venue: string
      location: string
      dateTime: Date
      level: Level
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!currentUser || !supabase) {
        return { ok: false, error: 'Sesión no disponible.' }
      }
      const title =
        payload.mode === 'direct' && payload.challengedTeam
          ? `${payload.challengerTeam.name} vs ${payload.challengedTeam.name}`
          : `${payload.challengerTeam.name} busca rival`
      const description =
        payload.message?.trim() ||
        (payload.mode === 'direct'
          ? `Desafío directo de ${payload.challengerTeam.name}`
          : `${payload.challengerTeam.name} está buscando rival`)

      const { data: oppData, error: oppErr } = await supabase
        .from('match_opportunities')
        .insert({
          type: 'rival',
          title,
          description,
          location: payload.location,
          venue: payload.venue,
          date_time: payload.dateTime.toISOString(),
          level: payload.level,
          creator_id: currentUser.id,
          team_name: payload.challengerTeam.name,
          gender: currentUser.gender,
          status: 'pending',
        })
        .select('*')
        .single()

      if (oppErr || !oppData) {
        return { ok: false, error: oppErr?.message ?? 'No se pudo crear el desafío' }
      }

      const challengeInsert = {
        opportunity_id: oppData.id,
        challenger_team_id: payload.challengerTeam.id,
        challenger_captain_id: currentUser.id,
        challenged_team_id:
          payload.mode === 'direct' ? payload.challengedTeam?.id ?? null : null,
        challenged_captain_id:
          payload.mode === 'direct'
            ? payload.challengedTeam?.captainId ?? null
            : null,
        mode: payload.mode,
        status: 'pending',
      }
      const { error: chErr } = await supabase
        .from('rival_challenges')
        .insert(challengeInsert)

      if (chErr) {
        await supabase.from('match_opportunities').delete().eq('id', oppData.id)
        return { ok: false, error: chErr.message }
      }

      const row = oppData as MatchOpportunityRow
      const mapped = mapMatchOpportunityFromDb(row, {
        id: currentUser.id,
        name: currentUser.name,
        photo_url: currentUser.photo,
      })
      setMatchOpportunities((prev) => [mapped, ...prev])
      const freshChallenges = await fetchRivalChallengesForUser(
        supabase,
        currentUser.id
      )
      setRivalChallengesStable(freshChallenges)
      trackProductEvent(ProductEventNames.matchCreateSuccess, {
        userId: currentUser.id,
        metadata: {
          match_type: 'rival',
          opportunity_id: oppData.id,
          rival_mode: payload.mode,
        },
        supabase,
      })
      return { ok: true }
    },
    [currentUser, supabase]
  )

  const logout = useCallback(async () => {
    setAnalyticsUser(null)
    try {
      if (isSupabaseConfigured() && supabase) {
        await supabase.auth.signOut()
      }
    } catch {
      // ignorar
    }
    try {
      await AsyncStorage.multiRemove([
        JOIN_TEAM_STORAGE_KEY,
        JOIN_MATCH_STORAGE_KEY,
        JOIN_REGISTER_STORAGE_KEY,
        OPEN_CREATE_AFTER_AUTH_KEY,
        CREATE_PREFILL_STORAGE_KEY,
        PENDING_TEAM_FOCUS_STORAGE_KEY,
        PLAYER_LAST_NAV_STORAGE_KEY,
        RIVAL_TARGET_TEAM_STORAGE_KEY,
      ])
    } catch {
      // ignore
    }
    setOnboardingSource('registration')
    setCurrentUser(null)
    clearLists()
  }, [supabase, clearLists])

  const value = useMemo<AppContextType>(
    () => ({
      authLoading,
      currentUser,
      isAuthenticated: currentUser !== null,
      needsOnboarding:
        currentUser !== null && needsOnboardingProfile(currentUser),
      needsVenueOnboarding:
        currentUser?.accountType === 'venue' && venueForOwner === null,
      login,
      loginWithGoogle,
      resolveTeamPickPrivateJoinCode,
      logout,
      matchOpportunities,
      users,
      teams,
      teamInvites,
      teamJoinRequests,
      rivalChallenges,
      participatingOpportunityIds,
      venueForOwner,
      onboardingSource,
      openProfileEditor,
      exitProfileEditor,
      completeOnboarding,
      completeVenueOnboarding,
      refreshMatchData,
      joinMatchOpportunity,
      respondToMatchInvitation,
      finalizeMatchOpportunity,
      suspendMatchOpportunity,
      submitMatchRating,
      getFilteredMatches,
      getUserTeams,
      acceptRivalOpportunityWithTeam,
      getFilteredTeams,
      getFilteredUsers,
      addMatchOpportunity,
      createTeamPickMatchOpportunity,
      reserveVenueOnly,
      createRivalChallenge,
      updateProfilePhoto,
      refreshTeamData,
      createTeam,
      updateTeam,
      deleteTeam,
      leaveTeam,
      updateTeamPrivateSettings,
      inviteToTeam,
      respondToInvite,
      requestToJoinTeam,
      respondToJoinRequest,
      cancelJoinRequest,
      respondToRivalChallenge,
      teamsDetailFocusTeamId,
      setTeamsDetailFocusTeamId,
    }),
    [
      authLoading,
      currentUser,
      matchOpportunities,
      users,
      teams,
      teamInvites,
      teamJoinRequests,
      rivalChallenges,
      participatingOpportunityIds,
      venueForOwner,
      onboardingSource,
      teamsDetailFocusTeamId,
      login,
      loginWithGoogle,
      resolveTeamPickPrivateJoinCode,
      logout,
      openProfileEditor,
      exitProfileEditor,
      completeOnboarding,
      completeVenueOnboarding,
      refreshMatchData,
      joinMatchOpportunity,
      respondToMatchInvitation,
      finalizeMatchOpportunity,
      suspendMatchOpportunity,
      submitMatchRating,
      getFilteredMatches,
      getUserTeams,
      acceptRivalOpportunityWithTeam,
      getFilteredTeams,
      getFilteredUsers,
      addMatchOpportunity,
      createTeamPickMatchOpportunity,
      reserveVenueOnly,
      createRivalChallenge,
      updateProfilePhoto,
      refreshTeamData,
      createTeam,
      updateTeam,
      deleteTeam,
      leaveTeam,
      updateTeamPrivateSettings,
      inviteToTeam,
      respondToInvite,
      requestToJoinTeam,
      respondToJoinRequest,
      cancelJoinRequest,
      respondToRivalChallenge,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp debe usarse dentro de AppProvider')
  }
  return ctx
}
