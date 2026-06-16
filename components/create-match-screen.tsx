import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useApp } from '../lib/app-provider'
import { useScreenTheme } from '../lib/theme-ui'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import { fetchSportsVenuesList } from '../lib/supabase/venue-owner-queries'
import {
  fetchVenueCourts,
  fetchVenueReservationsRange,
  fetchVenueWeeklyHours,
} from '../lib/supabase/venue-public-queries'
import { TIME_SLOT_OPTIONS } from '../lib/time-slot-options'
import type {
  Level,
  MatchType,
  PlayersSeekProfile,
  SportsVenue,
  Team,
  TeamPickRole,
} from '../lib/types'
import { computeVenueAvailableSlots, labelForHm } from '../lib/venue-slots'
import { levelLabel } from '../lib/format-match'
import { clearCreatePrefill, readCreatePrefill } from '../lib/create-prefill'
import { consumeRivalTargetTeamId } from '../lib/rival-prefill'
import { teamIsInSameCity, venueIsInSameCity } from '../lib/team-discovery'
import { MatchDatePickerField } from './match-date-picker-field'
import { MatchTimePickerField } from './match-time-picker-field'

const GUIDELINES: string[] = [
  'Respeto y buena convivencia: trata a rivales y compañeros con educación; el fútbol amateur es para pasarlo bien.',
  'Cero violencia: no se toleran agresiones ni provocaciones. Ante un conflicto, mejor cortar el partido y hablar con calma.',
  'Compromiso: si te apuntas o organizas, avisa con tiempo si no puedes ir para no dejar colgados a los demás.',
  'Nivel honesto: elige un nivel de juego acorde al grupo para que el partido sea parejo y entretenido.',
  'Cancha y pagos: la reserva, el pago y la coordinación con la cancha son responsabilidad del organizador (o de quienes acuerden por el chat); la app solo ayuda a juntar gente.',
  'Reglas del lugar: respeta horarios, el reglamento de la cancha y el cuidado de las instalaciones.',
]

const LEVELS: { value: Level; label: string }[] = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
  { value: 'competitivo', label: 'Competitivo' },
]

type FlowType = MatchType | 'reserve' | 'team_pick_flow' | null
const PLAYERS_FLOW_ENABLED = false
const RESERVE_FLOW_ENABLED = false

const TEAM_PICK_ROLES: { value: TeamPickRole; label: string }[] = [
  { value: 'gk', label: 'Arquero' },
  { value: 'defensa', label: 'Defensa' },
  { value: 'mediocampista', label: 'Mediocampo' },
  { value: 'delantero', label: 'Delantero' },
]

/** Colores camiseta / equipo (hex 6 para RPC). */
const TEAM_KIT_HEX: { key: string; hex: string }[] = [
  { key: 'black', hex: '#111111' },
  { key: 'white', hex: '#FFFFFF' },
  { key: 'red', hex: '#DC2626' },
  { key: 'blue', hex: '#2563EB' },
]

export function CreateMatchScreen() {
  const {
    currentUser,
    addMatchOpportunity,
    createTeamPickMatchOpportunity,
    reserveVenueOnly,
    createRivalChallenge,
    getUserTeams,
    getFilteredTeams,
  } = useApp()
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const revueltaUi = useMemo(
    () => ({
      text: theme.text,
      muted: theme.textMuted,
      border: theme.border,
      inputBg: theme.inputBg,
      surface: theme.cardElevated,
      onPrimary: theme.primaryBtnText,
      subtleIcon: theme.isDark ? 'rgba(47,158,68,0.9)' : theme.primary,
      /** Detalles team pick (mock mint / bosque). */
      teamPickMintField: theme.isDark ? 'rgba(55,214,122,0.1)' : 'rgba(47,158,68,0.1)',
      teamPickRoleOffBg: theme.isDark ? theme.cardElevated : theme.card,
      teamPickRoleOnBg: theme.primary,
      teamPickRoleOnText: theme.primaryBtnText,
    }),
    [theme]
  )

  const [step, setStep] = useState(1)
  const [matchType, setMatchType] = useState<FlowType>(null)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedRivalTeam, setSelectedRivalTeam] = useState<Team | null>(null)
  const [rivalMode, setRivalMode] = useState<'direct' | 'open'>('direct')
  const [rivalSearch, setRivalSearch] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    teamName: '',
    venue: '',
    location: 'Rancagua',
    date: '',
    time: '',
    level: 'intermedio' as Level,
    playersNeeded: 6,
  })
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [creatorIsGoalkeeper, setCreatorIsGoalkeeper] = useState(false)
  const [playersSeekProfile, setPlayersSeekProfile] =
    useState<PlayersSeekProfile | null>(null)
  const [sportsVenuesFromDb, setSportsVenuesFromDb] = useState<SportsVenue[]>(
    []
  )
  const [linkedVenueId, setLinkedVenueId] = useState<string | null>(null)
  const [bookCourtSlot, setBookCourtSlot] = useState(false)
  const [venueTimeOptions, setVenueTimeOptions] = useState<
    Array<{ value: string; label: string }> | null
  >(null)
  const [loadingVenueTimes, setLoadingVenueTimes] = useState(false)
  const [venueTimeHelp, setVenueTimeHelp] = useState<string | null>(null)
  const [alternativeVenues, setAlternativeVenues] = useState<SportsVenue[]>([])
  const [loadingAlternativeVenues, setLoadingAlternativeVenues] = useState(false)
  const [bookingNoCourt, setBookingNoCourt] = useState(false)
  const [venueTimesRefreshKey, setVenueTimesRefreshKey] = useState(0)
  const [venueModal, setVenueModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const venuePrefillAppliedRef = useRef(false)
  const [teamPickKind, setTeamPickKind] = useState<
    'team_pick_public' | 'team_pick_private'
  >('team_pick_public')
  const [creatorTeamPickRole, setCreatorTeamPickRole] =
    useState<TeamPickRole>('mediocampista')
  const [submittedJoinCode, setSubmittedJoinCode] = useState<string | null>(null)
  const [teamPickColorA, setTeamPickColorA] = useState('#DC2626')
  const [teamPickColorB, setTeamPickColorB] = useState('#2563EB')

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    void fetchSportsVenuesList(getSupabase()).then(setSportsVenuesFromDb)
  }, [])

  const organizerVenues = useMemo(() => {
    if (!currentUser) return []
    return sportsVenuesFromDb.filter((v) => venueIsInSameCity(currentUser, v))
  }, [currentUser, sportsVenuesFromDb])

  useEffect(() => {
    if (!currentUser?.city?.trim()) return
    setFormData((f) => ({ ...f, location: currentUser.city.trim() }))
  }, [currentUser?.id, currentUser?.city])

  useEffect(() => {
    if (!currentUser || organizerVenues.length === 0) return
    if (venuePrefillAppliedRef.current) return
    void (async () => {
      const prefill = await readCreatePrefill()
      if (!prefill) return
      const venue = organizerVenues.find((v) => v.id === prefill.sportsVenueId)
      if (!venue) return
      venuePrefillAppliedRef.current = true
      await clearCreatePrefill()
      setLinkedVenueId(prefill.sportsVenueId)
      setFormData((f) => ({
        ...f,
        venue: venue.name,
        location: prefill.city || f.location,
        date: prefill.date,
        time: prefill.time,
      }))
      setBookCourtSlot(prefill.bookCourtSlot)
    })()
  }, [currentUser?.id, organizerVenues])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const tid = await consumeRivalTargetTeamId()
      if (!tid || cancelled || !currentUser) return
      const others = getFilteredTeams(currentUser.gender).filter((t) =>
        teamIsInSameCity(currentUser, t)
      )
      const rival = others.find((x) => x.id === tid)
      if (rival) {
        setMatchType('rival')
        setRivalMode('direct')
        setSelectedRivalTeam(rival)
        setStep(2)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser?.id, getFilteredTeams])

  useEffect(() => {
    if (!linkedVenueId || !formData.date) {
      setVenueTimeOptions(null)
      setLoadingVenueTimes(false)
      setVenueTimeHelp(null)
      return
    }
    if (!isSupabaseConfigured()) return
    let cancelled = false
    setLoadingVenueTimes(true)
    setVenueTimeHelp('Buscando horarios disponibles…')
    void (async () => {
      const supabase = getSupabase()
      const venue = sportsVenuesFromDb.find((v) => v.id === linkedVenueId)
      const slotDuration = venue?.slotDurationMinutes ?? 60
      const dayStart = new Date(`${formData.date}T00:00:00`)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const dow = dayStart.getDay()
      const [courts, weeklyHours, reservations] = await Promise.all([
        fetchVenueCourts(supabase, linkedVenueId),
        fetchVenueWeeklyHours(supabase, linkedVenueId),
        fetchVenueReservationsRange(
          supabase,
          linkedVenueId,
          dayStart.toISOString(),
          dayEnd.toISOString()
        ),
      ])
      if (cancelled) return
      if (courts.length === 0) {
        setVenueTimeOptions([])
        setVenueTimeHelp('Este centro no tiene canchas registradas.')
        setLoadingVenueTimes(false)
        return
      }
      const dayHours = weeklyHours.find((h) => h.dayOfWeek === dow)
      if (!dayHours) {
        setVenueTimeOptions([])
        setVenueTimeHelp('Este centro no atiende en la fecha seleccionada.')
        setLoadingVenueTimes(false)
        return
      }
      const options = computeVenueAvailableSlots({
        dayStart,
        openTime: dayHours.openTime,
        closeTime: dayHours.closeTime,
        slotDurationMinutes: slotDuration,
        courtsCount: courts.length,
        reservations: reservations.filter((r) => r.status !== 'cancelled'),
      })
      setVenueTimeOptions(options)
      setVenueTimeHelp(
        options.length === 0
          ? 'No hay horarios disponibles para esta fecha.'
          : `Horarios disponibles considerando ${courts.length} cancha(s).`
      )
      setLoadingVenueTimes(false)
    })()
    return () => {
      cancelled = true
    }
  }, [linkedVenueId, formData.date, sportsVenuesFromDb, venueTimesRefreshKey])

  const selectedVenueHasChosenTime = useMemo(() => {
    if (!linkedVenueId || !formData.date || !formData.time) return true
    const allowed = new Set((venueTimeOptions ?? []).map((x) => x.value))
    return allowed.has(formData.time)
  }, [linkedVenueId, formData.date, formData.time, venueTimeOptions])

  const shouldSuggestAlternatives =
    bookingNoCourt || !selectedVenueHasChosenTime

  useEffect(() => {
    if (!linkedVenueId || !formData.date || !formData.time) {
      setAlternativeVenues([])
      setLoadingAlternativeVenues(false)
      setBookingNoCourt(false)
      return
    }
    if (!shouldSuggestAlternatives || !isSupabaseConfigured()) {
      setAlternativeVenues([])
      setLoadingAlternativeVenues(false)
      return
    }
    let cancelled = false
    setLoadingAlternativeVenues(true)
    void (async () => {
      const supabase = getSupabase()
      const dayStart = new Date(`${formData.date}T00:00:00`)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const dow = dayStart.getDay()
      const targetTime = formData.time
      const candidates = organizerVenues.filter((v) => v.id !== linkedVenueId)
      const checks = await Promise.all(
        candidates.map(async (venue) => {
          const [courts, weeklyHours, reservations] = await Promise.all([
            fetchVenueCourts(supabase, venue.id),
            fetchVenueWeeklyHours(supabase, venue.id),
            fetchVenueReservationsRange(
              supabase,
              venue.id,
              dayStart.toISOString(),
              dayEnd.toISOString()
            ),
          ])
          if (!courts.length) return null
          const dayH = weeklyHours.find((h) => h.dayOfWeek === dow)
          if (!dayH) return null
          const options = computeVenueAvailableSlots({
            dayStart,
            openTime: dayH.openTime,
            closeTime: dayH.closeTime,
            slotDurationMinutes: venue.slotDurationMinutes,
            courtsCount: courts.length,
            reservations: reservations.filter((r) => r.status !== 'cancelled'),
          })
          return options.some((o) => o.value === targetTime) ? venue : null
        })
      )
      if (cancelled) return
      const valid = checks.filter((v): v is SportsVenue => !!v)
      const sameCity = valid.filter((v) => v.city === formData.location)
      const otherCities = valid.filter((v) => v.city !== formData.location)
      setAlternativeVenues([...sameCity, ...otherCities].slice(0, 5))
      setLoadingAlternativeVenues(false)
    })()
    return () => {
      cancelled = true
    }
  }, [
    linkedVenueId,
    formData.date,
    formData.time,
    formData.location,
    shouldSuggestAlternatives,
    organizerVenues,
  ])

  const userTeams = getUserTeams()

  useEffect(() => {
    if (step !== 2 || matchType !== 'rival' || userTeams.length !== 1) return
    const onlyTeam = userTeams[0]
    setSelectedTeam((prev) => (prev?.id === onlyTeam.id ? prev : onlyTeam))
  }, [step, matchType, userTeams])
  const allTeams = currentUser ? getFilteredTeams(currentUser.gender) : []
  const rivalTeamsInCity = useMemo(() => {
    if (!currentUser) return []
    return allTeams
      .filter(
        (t) =>
          t.id !== selectedTeam?.id && !userTeams.some((ut) => ut.id === t.id)
      )
      .filter((t) => teamIsInSameCity(currentUser, t))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  }, [allTeams, currentUser, selectedTeam, userTeams])

  const rivalTeams = useMemo(() => {
    const q = rivalSearch.trim().toLowerCase()
    if (!q) return rivalTeamsInCity
    return rivalTeamsInCity.filter((t) => t.name.toLowerCase().includes(q))
  }, [rivalTeamsInCity, rivalSearch])

  useEffect(() => {
    if (!selectedRivalTeam) return
    if (!rivalTeamsInCity.some((t) => t.id === selectedRivalTeam.id)) {
      setSelectedRivalTeam(null)
    }
  }, [rivalTeamsInCity, selectedRivalTeam])

  const creatorCityLabel = currentUser?.city?.trim() || 'tu ciudad'

  const handleBack = () => {
    if (step > 1) {
      if (matchType === 'rival' && step === 4) {
        setStep(3)
        setSelectedRivalTeam(null)
      } else if (matchType === 'rival' && step === 3) {
        setStep(2)
      } else if (matchType === 'rival' && step === 2) {
        setStep(1)
        setSelectedTeam(null)
      } else if (matchType === 'players' && step === 4) {
        setStep(3)
      } else if (matchType === 'players' && step === 3) {
        setStep(2)
      } else if (matchType === 'players' && step === 2) {
        setStep(1)
        setPlayersSeekProfile(null)
      } else if (matchType === 'open' && step === 2) {
        setStep(1)
      } else if (matchType === 'team_pick_flow' && step === 3) {
        setStep(2)
      } else if (matchType === 'team_pick_flow' && step === 2) {
        setStep(1)
      } else if (matchType === 'reserve' && step === 2) {
        setStep(1)
      } else {
        setStep(step - 1)
      }
    } else {
      router.push('/home')
    }
  }

  const timeOptionsForPicker =
    linkedVenueId && formData.date ? venueTimeOptions ?? [] : TIME_SLOT_OPTIONS

  const onVenuePick = useCallback(
    (sv: SportsVenue) => {
      setLinkedVenueId(sv.id)
      setBookCourtSlot(matchType !== 'rival')
      setBookingNoCourt(false)
      setFormData((f) => ({
        ...f,
        venue: sv.name,
        location: sv.city,
      }))
      setVenueModal(false)
    },
    [matchType]
  )

  const renderVenueModalRow = useCallback(
    ({ item }: ListRenderItemInfo<SportsVenue>) => (
      <Pressable style={styles.modalRow} onPress={() => onVenuePick(item)}>
        <Text style={[styles.modalRowText, { color: theme.text }]}>
          {item.name}
        </Text>
      </Pressable>
    ),
    [onVenuePick, theme.text]
  )

  const renderUserTeamRow = useCallback(
    ({ item: team }: ListRenderItemInfo<Team>) => (
      <TeamSelectCard
        team={team}
        selected={selectedTeam?.id === team.id}
        variant="mine"
        layout="list"
        theme={theme}
        onPress={() => setSelectedTeam(team)}
      />
    ),
    [selectedTeam, theme]
  )

  const renderRivalTeamRow = useCallback(
    ({ item: team }: ListRenderItemInfo<Team>) => (
      <TeamSelectCard
        team={team}
        selected={selectedRivalTeam?.id === team.id}
        variant="rival"
        layout="list"
        theme={theme}
        onPress={() => setSelectedRivalTeam(team)}
      />
    ),
    [selectedRivalTeam, theme]
  )

  const alternativesBlock = useMemo(
    () => (
      <>
        {shouldSuggestAlternatives &&
        linkedVenueId &&
        formData.date &&
        formData.time ? (
          <View
            style={[
              styles.altBox,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(245, 158, 11, 0.14)',
                borderColor: theme.isDark
                  ? 'rgba(245, 158, 11, 0.42)'
                  : 'rgba(245, 158, 11, 0.35)',
              },
            ]}
          >
            <Text style={[styles.altTitle, { color: theme.text }]}>
              {bookingNoCourt
                ? `Se ocupó el último cupo a las ${labelForHm(formData.time)}.`
                : `Este centro no tiene cupo a las ${labelForHm(formData.time)}.`}
            </Text>
            {loadingAlternativeVenues ? (
              <Text style={[styles.altSub, { color: theme.textMuted }]}>
                Buscando otros centros…
              </Text>
            ) : alternativeVenues.length > 0 ? (
              <View style={styles.altChips}>
                {alternativeVenues.map((v) => (
                  <Pressable
                    key={v.id}
                    style={[
                      styles.altChip,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => {
                      setLinkedVenueId(v.id)
                      setBookCourtSlot(true)
                      setBookingNoCourt(false)
                      setFormData((prev) => ({
                        ...prev,
                        venue: v.name,
                        location: v.city,
                      }))
                    }}
                  >
                    <Text
                      style={[styles.altChipText, { color: theme.text }]}
                    >
                      {v.name} — {v.city}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.altSub, { color: theme.textMuted }]}>
                No hay otros centros con ese horario.
              </Text>
            )}
          </View>
        ) : null}
      </>
    ),
    [
      alternativeVenues,
      bookingNoCourt,
      formData.date,
      formData.time,
      theme.isDark,
      linkedVenueId,
      loadingAlternativeVenues,
      shouldSuggestAlternatives,
      theme.border,
      theme.card,
      theme.textMuted,
      theme.text,
    ]
  )

  const handleSubmit = async () => {
    if (!matchType || !currentUser) return
    if (matchType === 'players' && !PLAYERS_FLOW_ENABLED) {
      Alert.alert('Modo pausado', 'Buscar jugadores no está disponible por ahora.')
      return
    }
    if (matchType === 'players' && !playersSeekProfile) return
    const dateTime = new Date(`${formData.date}T${formData.time}`)
    if (Number.isNaN(dateTime.getTime())) {
      Alert.alert('Fecha u hora inválida', 'Selecciona fecha y hora del listado.')
      return
    }

    setSubmitting(true)
    try {
      if (matchType === 'team_pick_flow') {
        const supabase = getSupabase()
        const linked =
          sportsVenuesFromDb.find((x) => x.id === linkedVenueId) ??
          sportsVenuesFromDb.find((x) => x.name === formData.venue.trim())
        let cityId = linked?.cityId ?? null
        if (!cityId && isSupabaseConfigured()) {
          const { data: defCity, error: defErr } =
            await supabase.rpc('default_geo_city_id')
          if (!defErr && defCity) {
            cityId = defCity as string
          }
        }
        if (!cityId) {
          Alert.alert(
            'Ciudad requerida',
            'Selecciona un centro deportivo registrado o vuelve a intentar.'
          )
          setSubmitting(false)
          return
        }
        const res = await createTeamPickMatchOpportunity({
          type: teamPickKind,
          title: formData.title.trim() || 'Selección de equipos',
          description: formData.description.trim(),
          location: formData.location,
          venue: formData.venue,
          cityId,
          dateTime,
          level: formData.level,
          gender: currentUser.gender,
          sportsVenueId: linked?.id ?? linkedVenueId ?? null,
          bookCourtSlot: !!(linked && bookCourtSlot),
          courtSlotMinutes: linked?.slotDurationMinutes ?? 60,
          creatorEncounterRole: creatorTeamPickRole,
          teamPickColorA: teamPickColorA,
          teamPickColorB: teamPickColorB,
        })
        if (!res.ok) {
          if (res.code === 'no_court') {
            setBookingNoCourt(true)
            setVenueTimesRefreshKey((k) => k + 1)
          }
          Alert.alert('No se pudo publicar', res.error)
          return
        }
        setSubmittedJoinCode(res.joinCode ?? null)
        setIsSubmitted(true)
        return
      }

      if (matchType === 'reserve') {
        if (!linkedVenueId || !formData.date || !formData.time) return
        const venue = sportsVenuesFromDb.find((v) => v.id === linkedVenueId)
        const res = await reserveVenueOnly({
          sportsVenueId: linkedVenueId,
          startsAt: dateTime,
          durationMinutes: venue?.slotDurationMinutes ?? 60,
        })
        if (!res.ok) {
          if (res.code === 'no_court') {
            setBookingNoCourt(true)
            setVenueTimesRefreshKey((k) => k + 1)
          }
          Alert.alert('No se pudo reservar', res.error)
          return
        }
        setIsSubmitted(true)
        return
      }

      if (matchType === 'rival' && selectedTeam) {
        if (rivalMode === 'direct' && !selectedRivalTeam) return
        const res = await createRivalChallenge({
          challengerTeam: selectedTeam,
          mode: rivalMode,
          challengedTeam:
            rivalMode === 'direct' ? selectedRivalTeam ?? undefined : undefined,
          message: formData.description,
          venue: formData.venue,
          location: formData.location,
          dateTime,
          level: formData.level,
        })
        if (!res.ok) {
          Alert.alert('Error', res.error)
          return
        }
        setIsSubmitted(true)
        return
      }

      const linked =
        sportsVenuesFromDb.find((x) => x.id === linkedVenueId) ??
        sportsVenuesFromDb.find((x) => x.name === formData.venue.trim())
      const autoTitle =
        matchType === 'players'
          ? `Faltan ${formData.playersNeeded} ${
              formData.playersNeeded === 1 ? 'jugador' : 'jugadores'
            }`
          : matchType === 'open'
            ? 'Revuelta'
            : 'Partido'

      const res = await addMatchOpportunity({
        type: matchType,
        title: formData.title.trim() || autoTitle,
        description: formData.description,
        teamName: formData.teamName || undefined,
        venue: formData.venue,
        location: formData.location,
        dateTime,
        level: formData.level,
        creatorId: currentUser.id,
        creatorName: currentUser.name,
        creatorPhoto: currentUser.photo,
        playersNeeded: matchType === 'rival' ? undefined : formData.playersNeeded,
        playersJoined: matchType === 'rival' ? undefined : 0,
        gender: currentUser.gender,
        status: 'pending',
        creatorIsGoalkeeper:
          matchType === 'open' ? creatorIsGoalkeeper : undefined,
        playersSeekProfile:
          matchType === 'players' && playersSeekProfile
            ? playersSeekProfile
            : undefined,
        sportsVenueId: linked?.id,
        bookCourtSlot: linked && bookCourtSlot ? true : undefined,
        courtSlotMinutes: linked?.slotDurationMinutes,
      })
      if (!res.ok) {
        if (res.code === 'no_court') {
          setBookingNoCourt(true)
          setVenueTimesRefreshKey((k) => k + 1)
        }
        Alert.alert('No se pudo publicar', res.error)
        return
      }
      setIsSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (!currentUser || currentUser.accountType !== 'player') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <Text style={[styles.gate, { color: theme.textMuted }]}>
          Solo jugadores pueden publicar partidos aquí.
        </Text>
      </SafeAreaView>
    )
  }

  if (isSubmitted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <View style={styles.success}>
          <Text style={[styles.successIcon, { color: theme.primary }]}>
            ✓
          </Text>
          <Text style={[styles.successTitle, { color: theme.text }]}>
            {matchType === 'reserve' ? 'Reserva creada' : '¡Publicado!'}
          </Text>
          <Text style={[styles.successSub, { color: theme.textMuted }]}>
            {matchType === 'rival' && rivalMode === 'direct' && selectedRivalTeam
              ? `Tu desafío a ${selectedRivalTeam.name} fue enviado.`
              : matchType === 'rival'
                ? 'Tu búsqueda de rival ya está visible.'
                : matchType === 'players'
                  ? 'Tu búsqueda de jugadores ya está visible.'
                  : matchType === 'reserve'
                    ? 'Reserva pendiente de confirmación.'
                    : matchType === 'team_pick_flow'
                      ? teamPickKind === 'team_pick_private' && submittedJoinCode
                        ? `Partido privado listo. Comparte el código ${submittedJoinCode} para que se unan.`
                        : 'Tu partido de selección de equipos ya está visible. Empiezas en el equipo A.'
                      : 'Tu revuelta ya está visible.'}
          </Text>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.push('/home')}
          >
            <Text style={[styles.primaryBtnText, { color: revueltaUi.onPrimary }]}>
              Volver al inicio
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const totalSteps =
    matchType === 'rival'
      ? 4
      : matchType === 'players'
        ? 4
        : matchType === 'team_pick_flow'
          ? 3
          : 2
  const showCasualForm =
    (matchType === 'open' && step === 2) ||
    (matchType === 'players' && step === 4)
  const showTeamPickVisibility =
    matchType === 'team_pick_flow' && step === 2
  const showTeamPickForm = matchType === 'team_pick_flow' && step === 3
  const showReserveForm = matchType === 'reserve' && step === 2

  const onMatchDateChange = useCallback((date: string) => {
    setBookingNoCourt(false)
    setFormData((f) => ({ ...f, date }))
  }, [])

  const onMatchTimeChange = useCallback((time: string) => {
    setBookingNoCourt(false)
    setFormData((f) => ({ ...f, time }))
  }, [])

  const dateTimeValid =
    /^\d{4}-\d{2}-\d{2}$/.test(formData.date) && formData.time.length >= 4

  const topTitle =
    matchType === 'open' && step === 2
      ? 'Detalles de la revuelta'
      : matchType === 'team_pick_flow' && step === 2
        ? 'Tipo de partido'
        : matchType === 'team_pick_flow' && step === 3
          ? 'Detalles del partido'
          : 'Crear'

  const topSub =
    matchType === 'open' && step === 2
      ? 'Completa los datos y publica'
      : matchType === 'team_pick_flow' && step === 2
        ? 'Elige si cualquiera puede sumarse o solo quien tenga el código de unión.'
        : matchType === 'team_pick_flow' && step === 3
          ? `Paso ${step} de ${totalSteps}`
          : matchType === 'rival'
        ? `Paso ${step} de 4`
        : matchType
          ? `Paso ${step} de ${totalSteps}`
          : 'Elige un tipo de publicación'

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View
        style={[
          styles.topBar,
          { borderBottomColor: theme.border },
        ]}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={[
            styles.backBtn,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.backBtnText, { color: theme.text }]}>
            ←
          </Text>
        </Pressable>
        <View style={styles.topBarText}>
          <Text style={[styles.topTitle, { color: theme.text }]}>
            {topTitle}
          </Text>
          <Text style={[styles.topSub, { color: theme.textMuted }]}>{topSub}</Text>
        </View>
      </View>
      <View style={styles.stepProgressWrap}>
        <View
          style={[
            styles.stepProgressTrack,
            {
              backgroundColor: theme.skeleton,
            },
          ]}
        >
          <View
            style={[
              styles.stepProgressFill,
              {
                width: `${Math.max(12, Math.round((step / totalSteps) * 100))}%`,
                backgroundColor: theme.primary,
              },
            ]}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <View style={styles.section}>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Antes de publicar</Text>
              {GUIDELINES.map((line, i) => (
                <Text key={i} style={styles.infoLine}>
                  • {line}
                </Text>
              ))}
            </View>
            <Text style={styles.h2}>¿Qué quieres hacer?</Text>
            <Text style={[styles.h2Sub, { color: theme.textMuted }]}>
              Selecciona el tipo de partido para continuar
            </Text>
            <TypeCard
              title="Buscar rival"
              desc="Tu equipo vs otro equipo"
              selected={matchType === 'rival'}
              onPress={() => setMatchType('rival')}
              tone="red"
              icon="shield-outline"
            />
            <TypeCard
              title="Buscar jugadores"
              desc={
                PLAYERS_FLOW_ENABLED
                  ? 'Te faltan jugadores'
                  : 'Temporalmente pausado'
              }
              selected={matchType === 'players'}
              onPress={() => {
                if (!PLAYERS_FLOW_ENABLED) {
                  Alert.alert(
                    'Modo pausado',
                    'Buscar jugadores no está disponible por ahora.'
                  )
                  return
                }
                setMatchType('players')
              }}
              tone="blue"
              icon="person-add-outline"
            />
            <TypeCard
              title="Crear revuelta"
              desc="Partido abierto"
              selected={matchType === 'open'}
              onPress={() => {
                setMatchType('open')
                setFormData((f) => ({
                  ...f,
                  playersNeeded: Math.min(12, Math.max(10, f.playersNeeded)),
                }))
              }}
              tone="teal"
              icon="shuffle-outline"
            />
            <TypeCard
              title="Selección de equipos"
              desc="Equipo A o B, rol en cancha. Público o privado con código."
              selected={matchType === 'team_pick_flow'}
              onPress={() => {
                setMatchType('team_pick_flow')
                setTeamPickKind('team_pick_public')
                setCreatorTeamPickRole('mediocampista')
                setSubmittedJoinCode(null)
                setTeamPickColorA('#DC2626')
                setTeamPickColorB('#2563EB')
              }}
              tone="gold"
              icon="git-compare-outline"
            />
            {RESERVE_FLOW_ENABLED ? (
              <TypeCard
                title="Solo reservar cancha"
                desc="Sin crear partido"
                selected={matchType === 'reserve'}
                onPress={() => setMatchType('reserve')}
                tone="blue"
                icon="calendar-outline"
              />
            ) : null}
            <Pressable
              style={[styles.primaryBtn, !matchType && styles.btnDisabled]}
              disabled={!matchType}
              onPress={() => {
                if (matchType === 'rival') {
                  if (userTeams.length === 0) router.push('/equipos')
                  else setStep(2)
                } else if (matchType === 'players' && !PLAYERS_FLOW_ENABLED) {
                  Alert.alert(
                    'Modo pausado',
                    'Buscar jugadores no está disponible por ahora.'
                  )
                } else {
                  setStep(2)
                }
              }}
            >
              <Text style={styles.primaryBtnText}>
                {matchType === 'rival' && userTeams.length === 0
                  ? 'Crear equipo primero'
                  : 'Continuar →'}
              </Text>
            </Pressable>
          </View>
        )}

        {showTeamPickVisibility && (
          <View style={styles.section}>
            <Pressable
              style={[
                styles.teamPickTypeCard,
                {
                  backgroundColor: revueltaUi.surface,
                  borderColor:
                    teamPickKind === 'team_pick_public'
                      ? theme.primary
                      : revueltaUi.border,
                },
              ]}
              onPress={() => setTeamPickKind('team_pick_public')}
            >
              <View
                style={[
                  styles.teamPickTypeIconBox,
                  { backgroundColor: `${theme.primary}22` },
                ]}
              >
                <Ionicons name="globe-outline" size={22} color={theme.primary} />
              </View>
              <View style={styles.teamPickTypeTextCol}>
                <Text style={[styles.teamPickTypeTitle, { color: revueltaUi.text }]}>
                  Público
                </Text>
                <Text style={[styles.teamPickTypeDesc, { color: revueltaUi.muted }]}>
                  Aparece en el listado: cualquier jugador puede unirse al equipo A o
                  B.
                </Text>
              </View>
              <View
                style={[
                  styles.teamPickRadio,
                  {
                    borderColor:
                      teamPickKind === 'team_pick_public'
                        ? theme.primary
                        : revueltaUi.border,
                  },
                  teamPickKind === 'team_pick_public' && {
                    backgroundColor: theme.primary,
                  },
                ]}
              />
            </Pressable>
            <Pressable
              style={[
                styles.teamPickTypeCard,
                {
                  backgroundColor: revueltaUi.surface,
                  borderColor:
                    teamPickKind === 'team_pick_private'
                      ? theme.danger
                      : revueltaUi.border,
                },
              ]}
              onPress={() => setTeamPickKind('team_pick_private')}
            >
              <View
                style={[
                  styles.teamPickTypeIconBox,
                  { backgroundColor: 'rgba(239,68,68,0.15)' },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={22} color={theme.danger} />
              </View>
              <View style={styles.teamPickTypeTextCol}>
                <Text style={[styles.teamPickTypeTitle, { color: revueltaUi.text }]}>
                  Privado
                </Text>
                <Text style={[styles.teamPickTypeDesc, { color: revueltaUi.muted }]}>
                  No aparece igual que los demás: solo entra quien tenga el código de 4
                  dígitos que compartes.
                </Text>
              </View>
              <View
                style={[
                  styles.teamPickRadio,
                  {
                    borderColor:
                      teamPickKind === 'team_pick_private'
                        ? theme.danger
                        : revueltaUi.border,
                  },
                  teamPickKind === 'team_pick_private' && {
                    backgroundColor: theme.danger,
                  },
                ]}
              />
            </Pressable>
            <Pressable
              style={[
                styles.revueltaPublishBtn,
                { backgroundColor: theme.primary, marginTop: 20 },
              ]}
              onPress={() => setStep(3)}
            >
              <Text style={[styles.revueltaPublishText, { color: revueltaUi.onPrimary }]}>
                Continuar →
              </Text>
            </Pressable>
          </View>
        )}

        {step === 2 && matchType === 'rival' && (
          <View style={styles.section}>
            <Text style={styles.h2}>Tu equipo</Text>
            <Text style={[styles.h2Sub, { color: theme.textMuted }]}>
              Elige con qué equipo publicarás el desafío rival
            </Text>

            {userTeams.length === 1 ? (
              <TeamSelectCard
                team={userTeams[0]}
                selected={selectedTeam?.id === userTeams[0].id}
                variant="mine"
                layout="hero"
                theme={theme}
                onPress={() => setSelectedTeam(userTeams[0])}
              />
            ) : (
              <View style={styles.embeddedListWrap}>
                <FlatList
                  data={userTeams}
                  keyExtractor={(t) => t.id}
                  renderItem={renderUserTeamRow}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.teamSelectListContent}
                />
              </View>
            )}

            {selectedTeam ? (
              <View
                style={[
                  styles.teamSelectHint,
                  {
                    backgroundColor: theme.selectedTint,
                    borderColor: theme.isDark
                      ? 'rgba(102, 208, 111, 0.35)'
                      : 'rgba(15, 69, 57, 0.15)',
                  },
                ]}
              >
                <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                <Text style={[styles.teamSelectHintText, { color: theme.text }]}>
                  {selectedTeam.name} listo para desafiar
                </Text>
              </View>
            ) : (
              <Text style={[styles.teamSelectEmptyHint, { color: theme.textMuted }]}>
                Toca un equipo para continuar
              </Text>
            )}

            <Pressable
              style={[styles.primaryBtn, !selectedTeam && styles.btnDisabled]}
              disabled={!selectedTeam}
              onPress={() => setStep(3)}
            >
              <Text style={styles.primaryBtnText}>Continuar</Text>
            </Pressable>
          </View>
        )}

        {step === 3 && matchType === 'rival' && selectedTeam && (
          <View style={styles.section}>
            <Text style={styles.h2}>Rival</Text>
            <Text style={[styles.h2Sub, { color: theme.textMuted }]}>
              Elige cómo quieres encontrar al equipo contrincante
            </Text>

            <View style={styles.rivalModeRow}>
              <Pressable
                style={[
                  styles.rivalModeCard,
                  {
                    backgroundColor: theme.cardElevated,
                    borderColor:
                      rivalMode === 'open' ? theme.primary : theme.border,
                  },
                  rivalMode === 'open' && {
                    backgroundColor: theme.selectedTint,
                  },
                ]}
                onPress={() => {
                  setRivalMode('open')
                  setSelectedRivalTeam(null)
                  setRivalSearch('')
                }}
              >
                <View
                  style={[
                    styles.rivalModeIcon,
                    { backgroundColor: `${theme.primary}22` },
                  ]}
                >
                  <Ionicons name="globe-outline" size={20} color={theme.primary} />
                </View>
                <Text style={[styles.rivalModeTitle, { color: theme.text }]}>
                  Búsqueda abierta
                </Text>
                <Text style={[styles.rivalModeDesc, { color: theme.textMuted }]}>
                  Cualquier capitán de {creatorCityLabel} puede aceptar
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.rivalModeCard,
                  {
                    backgroundColor: theme.cardElevated,
                    borderColor:
                      rivalMode === 'direct' ? theme.danger : theme.border,
                  },
                  rivalMode === 'direct' && {
                    backgroundColor: theme.dangerSurface,
                  },
                ]}
                onPress={() => setRivalMode('direct')}
              >
                <View
                  style={[
                    styles.rivalModeIcon,
                    { backgroundColor: 'rgba(239,68,68,0.15)' },
                  ]}
                >
                  <Ionicons name="locate-outline" size={20} color={theme.danger} />
                </View>
                <Text style={[styles.rivalModeTitle, { color: theme.text }]}>
                  Equipo específico
                </Text>
                <Text style={[styles.rivalModeDesc, { color: theme.textMuted }]}>
                  Desafía directamente a un equipo de tu ciudad
                </Text>
              </Pressable>
            </View>

            {rivalMode === 'open' ? (
              <View
                style={[
                  styles.rivalOpenInfo,
                  {
                    backgroundColor: theme.selectedTint,
                    borderColor: theme.isDark
                      ? 'rgba(102, 208, 111, 0.35)'
                      : 'rgba(15, 69, 57, 0.15)',
                  },
                ]}
              >
                <Ionicons name="megaphone-outline" size={20} color={theme.primary} />
                <Text style={[styles.rivalOpenInfoText, { color: theme.text }]}>
                  Publicarás el desafío y el primer capitán interesado en{' '}
                  {creatorCityLabel} podrá responder.
                </Text>
              </View>
            ) : (
              <>
                <View
                  style={[
                    styles.rivalCityChip,
                    {
                      backgroundColor: theme.chipBg,
                      borderColor: theme.chipBorder,
                    },
                  ]}
                >
                  <Ionicons name="location-outline" size={16} color={theme.primaryAccent} />
                  <Text style={[styles.rivalCityChipText, { color: theme.text }]}>
                    Equipos en {creatorCityLabel}
                  </Text>
                  <Text style={[styles.rivalCityChipCount, { color: theme.textMuted }]}>
                    {rivalTeamsInCity.length}
                  </Text>
                </View>

                <View
                  style={[
                    styles.rivalSearchWrap,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.inputBorder,
                    },
                  ]}
                >
                  <Ionicons name="search-outline" size={18} color={theme.textMuted} />
                  <TextInput
                    style={[styles.rivalSearchInput, { color: theme.text }]}
                    placeholder="Buscar equipo…"
                    placeholderTextColor={theme.textMuted}
                    value={rivalSearch}
                    onChangeText={setRivalSearch}
                  />
                  {rivalSearch.length > 0 ? (
                    <Pressable hitSlop={8} onPress={() => setRivalSearch('')}>
                      <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                {rivalTeams.length === 0 ? (
                  <View
                    style={[
                      styles.rivalEmptyBox,
                      {
                        backgroundColor: theme.cardElevated,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={rivalTeamsInCity.length === 0 ? 'people-outline' : 'search-outline'}
                      size={28}
                      color={theme.textMuted}
                    />
                    <Text style={[styles.rivalEmptyTitle, { color: theme.text }]}>
                      {rivalTeamsInCity.length === 0
                        ? 'Sin equipos en tu ciudad'
                        : 'Sin resultados'}
                    </Text>
                    <Text style={[styles.rivalEmptyBody, { color: theme.textMuted }]}>
                      {rivalTeamsInCity.length === 0
                        ? `Aún no hay otros equipos rivales en ${creatorCityLabel}. Prueba con búsqueda abierta.`
                        : 'Prueba otro nombre o borra la búsqueda.'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.embeddedListWrap}>
                    <FlatList
                      data={rivalTeams}
                      keyExtractor={(t) => t.id}
                      renderItem={renderRivalTeamRow}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.teamSelectListContent}
                    />
                  </View>
                )}

                {selectedRivalTeam ? (
                  <View
                    style={[
                      styles.rivalSelectedHint,
                      {
                        backgroundColor: theme.dangerSurface,
                        borderColor: theme.isDark
                          ? 'rgba(239, 68, 68, 0.4)'
                          : 'rgba(239, 68, 68, 0.25)',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.rivalSelectedLogo,
                        {
                          backgroundColor: theme.logoBoxBg,
                          borderColor: theme.logoBoxBorder,
                        },
                      ]}
                    >
                      {selectedRivalTeam.logo ? (
                        <Image
                          source={{ uri: selectedRivalTeam.logo }}
                          style={styles.rivalSelectedLogoImg}
                          contentFit="cover"
                        />
                      ) : (
                        <Ionicons name="shield" size={18} color={theme.danger} />
                      )}
                    </View>
                    <View style={styles.rivalSelectedTextCol}>
                      <Text style={[styles.rivalSelectedLabel, { color: theme.textMuted }]}>
                        Rival elegido
                      </Text>
                      <Text
                        style={[styles.rivalSelectedName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {selectedRivalTeam.name}
                      </Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={22} color={theme.danger} />
                  </View>
                ) : rivalTeams.length > 0 ? (
                  <Text style={[styles.teamSelectEmptyHint, { color: theme.textMuted }]}>
                    Toca un equipo rival para continuar
                  </Text>
                ) : null}
              </>
            )}

            <Pressable
              style={[
                rivalMode === 'direct' ? styles.dangerBtn : styles.primaryBtn,
                rivalMode === 'direct' && !selectedRivalTeam && styles.btnDisabled,
              ]}
              disabled={rivalMode === 'direct' && !selectedRivalTeam}
              onPress={() => {
                if (selectedTeam) {
                  setFormData((p) => ({ ...p, level: selectedTeam.level }))
                }
                setStep(4)
              }}
            >
              <Text style={styles.primaryBtnText}>Continuar</Text>
            </Pressable>
          </View>
        )}

        {step === 4 && matchType === 'rival' && selectedTeam && (
          <View style={styles.section}>
            <View style={styles.vsBox}>
              <Text style={styles.teamName}>{selectedTeam.name}</Text>
              <Text style={styles.vs}>VS</Text>
              <Text style={styles.teamName}>
                {rivalMode === 'direct'
                  ? selectedRivalTeam?.name
                  : 'Rival por confirmar'}
              </Text>
            </View>
            <Text style={styles.label}>Mensaje (opcional)</Text>
            <TextInput
              style={styles.textArea}
              multiline
              value={formData.description}
              onChangeText={(t) => setFormData({ ...formData, description: t })}
            />
            <VenueRow
              label="Cancha propuesta"
              venue={formData.venue}
              onPress={() => setVenueModal(true)}
            />
            <Text style={styles.label}>Fecha</Text>
            <MatchDatePickerField
              value={formData.date}
              onChange={onMatchDateChange}
            />
            <Text style={styles.label}>Hora</Text>
            <MatchTimePickerField
              value={formData.time}
              onChange={onMatchTimeChange}
              options={timeOptionsForPicker}
              loading={!!linkedVenueId && !!formData.date && loadingVenueTimes}
            />
            {venueTimeHelp && linkedVenueId && formData.date ? (
              <Text style={styles.help}>{venueTimeHelp}</Text>
            ) : null}
            {alternativesBlock}
            <Text style={styles.label}>Nivel</Text>
            <LevelGrid
              value={formData.level}
              onChange={(l) => setFormData({ ...formData, level: l })}
              variant="rival"
            />
            <Pressable
              style={[
                styles.dangerBtn,
                (!formData.venue ||
                  !dateTimeValid ||
                  !selectedVenueHasChosenTime ||
                  bookingNoCourt) &&
                  styles.btnDisabled,
              ]}
              disabled={
                !formData.venue ||
                !dateTimeValid ||
                !selectedVenueHasChosenTime ||
                bookingNoCourt ||
                submitting
              }
              onPress={() => void handleSubmit()}
            >
              {submitting ? (
                <ActivityIndicator color={theme.primaryBtnText} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {rivalMode === 'direct'
                    ? 'Enviar desafío'
                    : 'Publicar búsqueda'}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {step === 2 && matchType === 'players' && (
          <View style={styles.section}>
            <Text style={styles.h2}>¿Cuántos jugadores?</Text>
            <View style={styles.counterRow}>
              <Pressable
                style={styles.counterBtn}
                onPress={() =>
                  setFormData((f) => ({
                    ...f,
                    playersNeeded: Math.max(1, f.playersNeeded - 1),
                  }))
                }
              >
                <Text style={styles.counterBtnText}>−</Text>
              </Pressable>
              <Text style={styles.counterVal}>{formData.playersNeeded}</Text>
              <Pressable
                style={styles.counterBtn}
                onPress={() =>
                  setFormData((f) => ({
                    ...f,
                    playersNeeded: Math.min(12, f.playersNeeded + 1),
                  }))
                }
              >
                <Text style={styles.counterBtnText}>+</Text>
              </Pressable>
            </View>
            <Pressable style={styles.primaryBtn} onPress={() => setStep(3)}>
              <Text style={styles.primaryBtnText}>Continuar</Text>
            </Pressable>
          </View>
        )}

        {step === 3 && matchType === 'players' && (
          <View style={styles.section}>
            <Text style={styles.h2}>¿Qué cupos ofreces?</Text>
            {(
              [
                ['gk_only', 'Solo arquero(s)', 'Uno o más arqueros.'] as const,
                [
                  'field_only',
                  'Solo jugadores de campo',
                  'Sin arquero en esta búsqueda.',
                ] as const,
                [
                  'gk_and_field',
                  'Arquero y campo',
                  'Máx. 1 arquero y el resto campo.',
                ] as const,
              ] as const
            ).map(([value, title, desc]) => (
              <Pressable
                key={value}
                style={[
                  styles.seekCard,
                  playersSeekProfile === value && styles.seekCardOn,
                ]}
                onPress={() => setPlayersSeekProfile(value)}
              >
                <Text style={styles.teamName}>{title}</Text>
                <Text style={styles.muted}>{desc}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.primaryBtn, !playersSeekProfile && styles.btnDisabled]}
              disabled={!playersSeekProfile}
              onPress={() => setStep(4)}
            >
              <Text style={styles.primaryBtnText}>Continuar al formulario</Text>
            </Pressable>
          </View>
        )}

        {showCasualForm && matchType && (
          <View style={styles.section}>
            {matchType === 'open' ? (
              <View
                style={[
                  styles.revueltaCard,
                  {
                    backgroundColor: revueltaUi.surface,
                    borderColor: revueltaUi.border,
                  },
                ]}
              >
                <Text style={[styles.revueltaFieldLabel, { color: revueltaUi.text }]}>
                  Título
                </Text>
                <TextInput
                  style={[
                    styles.revueltaInput,
                    {
                      backgroundColor: revueltaUi.inputBg,
                      borderColor: revueltaUi.border,
                      color: revueltaUi.text,
                    },
                  ]}
                  value={formData.title}
                  onChangeText={(t) => setFormData({ ...formData, title: t })}
                  placeholder="Ej: Partido domingo en la tarde"
                  placeholderTextColor={revueltaUi.muted}
                />
                <Text
                  style={[
                    styles.revueltaFieldLabel,
                    { color: revueltaUi.text, marginTop: 14 },
                  ]}
                >
                  Descripción (opcional)
                </Text>
                <TextInput
                  style={[
                    styles.revueltaTextArea,
                    {
                      backgroundColor: revueltaUi.inputBg,
                      borderColor: revueltaUi.border,
                      color: revueltaUi.text,
                    },
                  ]}
                  multiline
                  value={formData.description}
                  onChangeText={(t) =>
                    setFormData({ ...formData, description: t })
                  }
                  placeholder="Agrega mas detalles…"
                  placeholderTextColor={revueltaUi.muted}
                />
                <Text
                  style={[
                    styles.revueltaFieldLabel,
                    { color: revueltaUi.text, marginTop: 14 },
                  ]}
                >
                  Jugadores necesarios
                </Text>
                <Text style={[styles.revueltaHint, { color: revueltaUi.muted }]}>
                  Total en cancha (incluye tu cupo como organizador). Mín. 10 · Máx.
                  12.
                </Text>
                <View style={styles.revueltaCounterRow}>
                  <Pressable
                    style={[
                      styles.revueltaCounterBtn,
                      {
                        borderColor: revueltaUi.border,
                        backgroundColor: revueltaUi.inputBg,
                      },
                    ]}
                    onPress={() =>
                      setFormData((f) => ({
                        ...f,
                        playersNeeded: Math.max(10, f.playersNeeded - 1),
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.revueltaCounterBtnText,
                        { color: revueltaUi.text },
                      ]}
                    >
                      −
                    </Text>
                  </Pressable>
                  <Text
                    style={[styles.revueltaCounterVal, { color: revueltaUi.text }]}
                  >
                    {formData.playersNeeded}
                  </Text>
                  <Pressable
                    style={[
                      styles.revueltaCounterBtn,
                      {
                        borderColor: revueltaUi.border,
                        backgroundColor: revueltaUi.inputBg,
                      },
                    ]}
                    onPress={() =>
                      setFormData((f) => ({
                        ...f,
                        playersNeeded: Math.min(12, f.playersNeeded + 1),
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.revueltaCounterBtnText,
                        { color: revueltaUi.text },
                      ]}
                    >
                      +
                    </Text>
                  </Pressable>
                </View>
                <RevFieldIconLabel
                  icon="shield-outline"
                  label="Tu rol en la revuelta"
                  accent={revueltaUi.subtleIcon}
                  labelColor={revueltaUi.text}
                />
                <View style={styles.revueltaRoleRow}>
                  <Pressable
                    style={[
                      styles.revueltaRoleBtn,
                      { borderColor: revueltaUi.border },
                      !creatorIsGoalkeeper && {
                        backgroundColor: theme.primary,
                        borderColor: theme.primary,
                      },
                      creatorIsGoalkeeper && {
                        backgroundColor: revueltaUi.inputBg,
                      },
                    ]}
                    onPress={() => setCreatorIsGoalkeeper(false)}
                  >
                    <Text
                      style={[
                        styles.revueltaRoleBtnText,
                        {
                          color: creatorIsGoalkeeper
                            ? revueltaUi.text
                            : revueltaUi.onPrimary,
                        },
                      ]}
                    >
                      Jugador de campo
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.revueltaRoleBtn,
                      { borderColor: revueltaUi.border },
                      creatorIsGoalkeeper && {
                        backgroundColor: theme.primary,
                        borderColor: theme.primary,
                      },
                      !creatorIsGoalkeeper && {
                        backgroundColor: revueltaUi.inputBg,
                      },
                    ]}
                    onPress={() => setCreatorIsGoalkeeper(true)}
                  >
                    <Text
                      style={[
                        styles.revueltaRoleBtnText,
                        {
                          color: !creatorIsGoalkeeper
                            ? revueltaUi.text
                            : revueltaUi.onPrimary,
                        },
                      ]}
                    >
                      Arquero
                    </Text>
                  </Pressable>
                </View>
                <RevFieldIconLabel
                  icon="location-outline"
                  label="Cancha / Lugar"
                  accent={revueltaUi.subtleIcon}
                  labelColor={revueltaUi.text}
                />
                <Pressable
                  style={[
                    styles.revueltaPicker,
                    {
                      backgroundColor: revueltaUi.inputBg,
                      borderColor: revueltaUi.border,
                    },
                  ]}
                  onPress={() => setVenueModal(true)}
                >
                  <Text
                    style={[
                      styles.revueltaPickerText,
                      {
                        color: formData.venue
                          ? revueltaUi.text
                          : revueltaUi.muted,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {formData.venue || 'Selecciona un centro deportivo'}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={revueltaUi.muted}
                  />
                </Pressable>
                {linkedVenueId ? (
                  <View style={styles.revueltaSwitchRow}>
                    <Text
                      style={[styles.revueltaSwitchLabel, { color: revueltaUi.text }]}
                    >
                      Reservar cancha al publicar
                    </Text>
                    <Switch
                      value={bookCourtSlot}
                      onValueChange={setBookCourtSlot}
                      trackColor={{
                        false: theme.isDark ? '#3f3f46' : '#d4d4d8',
                        true: theme.primary,
                      }}
                      thumbColor={theme.isDark ? '#fafafa' : '#fff'}
                    />
                  </View>
                ) : null}
                <Text
                  style={[
                    styles.revueltaFieldLabel,
                    { color: revueltaUi.text, marginTop: 16 },
                  ]}
                >
                  Fecha & Hora
                </Text>
                <View style={styles.revueltaDateTimeRow}>
                  <View style={styles.revueltaDateTimeCol}>
                    <View style={styles.revueltaMiniLabelRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={15}
                        color={revueltaUi.subtleIcon}
                      />
                      <Text
                        style={[styles.revueltaMiniLabel, { color: revueltaUi.muted }]}
                      >
                        Fecha
                      </Text>
                    </View>
                    <MatchDatePickerField
                      variant="revuelta"
                      value={formData.date}
                      onChange={onMatchDateChange}
                      backgroundColor={revueltaUi.inputBg}
                      borderColor={revueltaUi.border}
                      textColor={revueltaUi.text}
                      mutedColor={revueltaUi.muted}
                    />
                  </View>
                  <View style={styles.revueltaDateTimeCol}>
                    <View style={styles.revueltaMiniLabelRow}>
                      <Ionicons
                        name="time-outline"
                        size={15}
                        color={revueltaUi.subtleIcon}
                      />
                      <Text
                        style={[styles.revueltaMiniLabel, { color: revueltaUi.muted }]}
                      >
                        Hora
                      </Text>
                    </View>
                    <MatchTimePickerField
                      variant="revuelta"
                      value={formData.time}
                      onChange={onMatchTimeChange}
                      options={timeOptionsForPicker}
                      loading={!!linkedVenueId && !!formData.date && loadingVenueTimes}
                      backgroundColor={revueltaUi.inputBg}
                      borderColor={revueltaUi.border}
                      textColor={revueltaUi.text}
                      mutedColor={revueltaUi.muted}
                    />
                  </View>
                </View>
                {venueTimeHelp && linkedVenueId && formData.date ? (
                  <Text style={[styles.help, { color: revueltaUi.muted }]}>
                    {venueTimeHelp}
                  </Text>
                ) : null}
                {alternativesBlock}
                <RevFieldIconLabel
                  icon="star-outline"
                  label="Nivel"
                  accent={revueltaUi.subtleIcon}
                  labelColor={revueltaUi.text}
                />
                <LevelGrid
                  value={formData.level}
                  onChange={(l) => setFormData({ ...formData, level: l })}
                  variant="revuelta"
                  accent={theme.primary}
                  labelColor={revueltaUi.text}
                  mutedColor={revueltaUi.muted}
                />
                <Pressable
                  style={[
                    styles.revueltaPublishBtn,
                    {
                      backgroundColor: theme.primary,
                    },
                    (!formData.venue ||
                      !dateTimeValid ||
                      !selectedVenueHasChosenTime ||
                      bookingNoCourt) &&
                      styles.btnDisabled,
                  ]}
                  disabled={
                    !formData.venue ||
                    !dateTimeValid ||
                    !selectedVenueHasChosenTime ||
                    bookingNoCourt ||
                    submitting
                  }
                  onPress={() => void handleSubmit()}
                >
                  {submitting ? (
                    <ActivityIndicator color={revueltaUi.onPrimary} />
                  ) : (
                    <Text
                      style={[
                        styles.revueltaPublishText,
                        { color: revueltaUi.onPrimary },
                      ]}
                    >
                      Publicar
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.h2}>Detalles</Text>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryText}>
                    {formData.playersNeeded} cupos ·{' '}
                    {playersSeekProfile === 'gk_only' && 'Solo arquero(s)'}
                    {playersSeekProfile === 'field_only' && 'Solo campo'}
                    {playersSeekProfile === 'gk_and_field' && 'Arquero + campo'}
                  </Text>
                </View>
                <VenueRow
                  label="Cancha / lugar"
                  venue={formData.venue || 'Seleccionar centro'}
                  onPress={() => setVenueModal(true)}
                />
                {linkedVenueId ? (
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>
                      Reservar cancha al publicar
                    </Text>
                    <Switch
                      value={bookCourtSlot}
                      onValueChange={setBookCourtSlot}
                    />
                  </View>
                ) : null}
                <Text style={styles.label}>Fecha</Text>
                <MatchDatePickerField
                  value={formData.date}
                  onChange={onMatchDateChange}
                />
                <Text style={styles.label}>Hora</Text>
                <MatchTimePickerField
                  value={formData.time}
                  onChange={onMatchTimeChange}
                  options={timeOptionsForPicker}
                  loading={!!linkedVenueId && !!formData.date && loadingVenueTimes}
                />
                {venueTimeHelp && linkedVenueId && formData.date ? (
                  <Text style={styles.help}>{venueTimeHelp}</Text>
                ) : null}
                {alternativesBlock}
                <Pressable
                  style={[
                    styles.primaryBtn,
                    (!formData.venue ||
                      !dateTimeValid ||
                      !selectedVenueHasChosenTime ||
                      bookingNoCourt) &&
                      styles.btnDisabled,
                  ]}
                  disabled={
                    !formData.venue ||
                    !dateTimeValid ||
                    !selectedVenueHasChosenTime ||
                    bookingNoCourt ||
                    submitting
                  }
                  onPress={() => void handleSubmit()}
                >
                  {submitting ? (
                    <ActivityIndicator color={theme.primaryBtnText} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Publicar búsqueda</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        )}

        {showTeamPickForm && (
          <View style={styles.section}>
            <View
              style={[
                styles.teamPickDetailSheet,
                {
                  backgroundColor: revueltaUi.surface,
                  borderColor: revueltaUi.border,
                },
              ]}
            >
              <Text
                style={[styles.teamPickHeroTitle, { color: revueltaUi.text }]}
              >
                Selección de equipos — detalles del partido
              </Text>
              <Text
                style={[styles.teamPickHeroSub, { color: revueltaUi.muted }]}
              >
                Los jugadores eligen equipo A o B y su rol (arquero o línea).
                Máximo 6 por equipo.
              </Text>
              <Text style={[styles.revueltaFieldLabel, { color: revueltaUi.text }]}>
                Título (opcional)
              </Text>
              <TextInput
                style={[
                  styles.revueltaInput,
                  {
                    backgroundColor: revueltaUi.teamPickMintField,
                    borderColor: revueltaUi.border,
                    color: revueltaUi.text,
                  },
                ]}
                value={formData.title}
                onChangeText={(t) => setFormData({ ...formData, title: t })}
                placeholder="Ej: 6vs6 sábado en la tarde"
                placeholderTextColor={revueltaUi.muted}
              />
              <Text
                style={[
                  styles.revueltaFieldLabel,
                  { color: revueltaUi.text, marginTop: 14 },
                ]}
              >
                Descripción (opcional)
              </Text>
              <TextInput
                style={[
                  styles.revueltaTextArea,
                  {
                    backgroundColor: revueltaUi.teamPickMintField,
                    borderColor: revueltaUi.border,
                    color: revueltaUi.text,
                  },
                ]}
                multiline
                value={formData.description}
                onChangeText={(t) =>
                  setFormData({ ...formData, description: t })
                }
                placeholder="Reglas, pelota, vestimenta…"
                placeholderTextColor={revueltaUi.muted}
              />
              <RevFieldIconLabel
                icon="shield-outline"
                label="Tu rol (organizás en equipo A)"
                accent={revueltaUi.subtleIcon}
                labelColor={revueltaUi.text}
              />
              <View style={styles.levelGrid}>
                {TEAM_PICK_ROLES.map((r) => {
                  const on = creatorTeamPickRole === r.value
                  return (
                    <Pressable
                      key={r.value}
                      style={[
                        styles.teamPickRoleCell,
                        on && {
                          backgroundColor: revueltaUi.teamPickRoleOnBg,
                          borderColor: revueltaUi.teamPickRoleOnBg,
                        },
                        !on && {
                          borderColor: revueltaUi.border,
                          backgroundColor: revueltaUi.teamPickRoleOffBg,
                        },
                      ]}
                      onPress={() => setCreatorTeamPickRole(r.value)}
                    >
                      <Text
                        style={[
                          styles.teamPickRoleCellText,
                          {
                            color: on
                              ? revueltaUi.teamPickRoleOnText
                              : revueltaUi.text,
                          },
                        ]}
                      >
                        {r.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text style={[styles.revueltaFieldLabel, { color: revueltaUi.text, marginTop: 18 }]}>
                Color de equipo
              </Text>
              <View style={styles.teamPickColorsRow}>
                <View style={styles.teamPickColorCol}>
                  <View
                    style={[
                      styles.teamPickColorCard,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: revueltaUi.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.teamPickColorColTitle, { color: revueltaUi.muted }]}
                    >
                      EQUIPO A
                    </Text>
                    <View style={styles.teamPickShieldGrid}>
                      {TEAM_KIT_HEX.map((c) => {
                        const sel = teamPickColorA === c.hex
                        const whiteKit = c.hex === '#FFFFFF'
                        return (
                          <Pressable
                            key={`a-${c.key}`}
                            style={[
                              styles.teamPickShieldOuter,
                              {
                                borderColor: sel
                                  ? theme.primary
                                  : revueltaUi.border,
                                backgroundColor: whiteKit
                                  ? theme.skeleton
                                  : revueltaUi.teamPickRoleOffBg,
                              },
                              sel && styles.teamPickShieldOuterOn,
                            ]}
                            onPress={() => setTeamPickColorA(c.hex)}
                          >
                            <Ionicons name="shield" size={18} color={c.hex} />
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>
                </View>
                <View style={styles.teamPickColorCol}>
                  <View
                    style={[
                      styles.teamPickColorCard,
                      {
                        backgroundColor: theme.inputBg,
                        borderColor: revueltaUi.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.teamPickColorColTitle, { color: revueltaUi.muted }]}
                    >
                      EQUIPO B
                    </Text>
                    <View style={styles.teamPickShieldGrid}>
                      {TEAM_KIT_HEX.map((c) => {
                        const sel = teamPickColorB === c.hex
                        const whiteKit = c.hex === '#FFFFFF'
                        return (
                          <Pressable
                            key={`b-${c.key}`}
                            style={[
                              styles.teamPickShieldOuter,
                              {
                                borderColor: sel
                                  ? theme.primary
                                  : revueltaUi.border,
                                backgroundColor: whiteKit
                                  ? theme.skeleton
                                  : revueltaUi.teamPickRoleOffBg,
                              },
                              sel && styles.teamPickShieldOuterOn,
                            ]}
                            onPress={() => setTeamPickColorB(c.hex)}
                          >
                            <Ionicons name="shield" size={18} color={c.hex} />
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>
                </View>
              </View>
              <RevFieldIconLabel
                icon="location-outline"
                label="Cancha / Lugar"
                accent={revueltaUi.subtleIcon}
                labelColor={revueltaUi.text}
              />
              <Pressable
                style={[
                  styles.revueltaPicker,
                  {
                    backgroundColor: revueltaUi.teamPickMintField,
                    borderColor: revueltaUi.border,
                  },
                ]}
                onPress={() => setVenueModal(true)}
              >
                <Text
                  style={[
                    styles.revueltaPickerText,
                    {
                      color: formData.venue ? revueltaUi.text : revueltaUi.muted,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {formData.venue || 'Selecciona un centro deportivo'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={revueltaUi.muted} />
              </Pressable>
              {linkedVenueId ? (
                <View style={styles.revueltaSwitchRow}>
                  <Text
                    style={[styles.revueltaSwitchLabel, { color: revueltaUi.text }]}
                  >
                    Reservar cancha al publicar
                  </Text>
                  <Switch
                    value={bookCourtSlot}
                    onValueChange={setBookCourtSlot}
                    trackColor={{
                      false: theme.isDark ? '#3f3f46' : '#d4d4d8',
                      true: theme.primary,
                    }}
                    thumbColor={theme.isDark ? '#fafafa' : '#fff'}
                  />
                </View>
              ) : null}
              <Text
                style={[
                  styles.revueltaFieldLabel,
                  { color: revueltaUi.text, marginTop: 16 },
                ]}
              >
                Fecha & Hora
              </Text>
              <View style={styles.revueltaDateTimeRow}>
                <View style={styles.revueltaDateTimeCol}>
                  <View style={styles.revueltaMiniLabelRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={15}
                      color={revueltaUi.subtleIcon}
                    />
                    <Text
                      style={[styles.revueltaMiniLabel, { color: revueltaUi.muted }]}
                    >
                      Fecha
                    </Text>
                  </View>
                  <MatchDatePickerField
                    variant="revuelta"
                    value={formData.date}
                    onChange={onMatchDateChange}
                    backgroundColor={revueltaUi.teamPickMintField}
                    borderColor={revueltaUi.border}
                    textColor={revueltaUi.text}
                    mutedColor={revueltaUi.muted}
                  />
                </View>
                <View style={styles.revueltaDateTimeCol}>
                  <View style={styles.revueltaMiniLabelRow}>
                    <Ionicons
                      name="time-outline"
                      size={15}
                      color={revueltaUi.subtleIcon}
                    />
                    <Text
                      style={[styles.revueltaMiniLabel, { color: revueltaUi.muted }]}
                    >
                      Hora
                    </Text>
                  </View>
                  <MatchTimePickerField
                    variant="revuelta"
                    value={formData.time}
                    onChange={onMatchTimeChange}
                    options={timeOptionsForPicker}
                    loading={!!linkedVenueId && !!formData.date && loadingVenueTimes}
                    backgroundColor={revueltaUi.teamPickMintField}
                    borderColor={revueltaUi.border}
                    textColor={revueltaUi.text}
                    mutedColor={revueltaUi.muted}
                  />
                </View>
              </View>
              {venueTimeHelp && linkedVenueId && formData.date ? (
                <Text style={[styles.help, { color: revueltaUi.muted }]}>
                  {venueTimeHelp}
                </Text>
              ) : null}
              {alternativesBlock}
              <RevFieldIconLabel
                icon="star-outline"
                label="Nivel"
                accent={revueltaUi.subtleIcon}
                labelColor={revueltaUi.text}
              />
              <LevelGrid
                value={formData.level}
                onChange={(l) => setFormData({ ...formData, level: l })}
                variant="revuelta"
                accent={theme.primary}
                labelColor={revueltaUi.text}
                mutedColor={revueltaUi.muted}
              />
              <Pressable
                style={[
                  styles.teamPickPublishBtn,
                  { backgroundColor: theme.primary },
                  (!formData.venue ||
                    !dateTimeValid ||
                    !selectedVenueHasChosenTime ||
                    bookingNoCourt) &&
                    styles.btnDisabled,
                ]}
                disabled={
                  !formData.venue ||
                  !dateTimeValid ||
                  !selectedVenueHasChosenTime ||
                  bookingNoCourt ||
                  submitting
                }
                onPress={() => void handleSubmit()}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.primaryBtnText} />
                ) : (
                  <Text style={styles.teamPickPublishText}>
                    Publicar selección de equipos
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {showReserveForm && (
          <View style={styles.section}>
            <Text style={styles.h2}>Reserva rápida</Text>
            <VenueRow
              label="Centro"
              venue={formData.venue || 'Seleccionar'}
              onPress={() => setVenueModal(true)}
            />
            <Text style={styles.label}>Fecha</Text>
            <MatchDatePickerField
              value={formData.date}
              onChange={onMatchDateChange}
            />
            <Text style={styles.label}>Hora</Text>
            <MatchTimePickerField
              value={formData.time}
              onChange={onMatchTimeChange}
              options={timeOptionsForPicker}
              loading={!!linkedVenueId && !!formData.date && loadingVenueTimes}
            />
            {alternativesBlock}
            <Pressable
              style={[
                styles.primaryBtn,
                (!linkedVenueId ||
                  !dateTimeValid ||
                  !selectedVenueHasChosenTime ||
                  bookingNoCourt) &&
                  styles.btnDisabled,
              ]}
              disabled={
                !linkedVenueId ||
                !dateTimeValid ||
                !selectedVenueHasChosenTime ||
                bookingNoCourt ||
                submitting
              }
              onPress={() => void handleSubmit()}
            >
              <Text style={styles.primaryBtnText}>Reservar cancha</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>

      <Modal visible={venueModal} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: theme.card,
                borderTopColor: theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.text, borderBottomColor: theme.border },
              ]}
            >
              Centro deportivo
              {currentUser?.city?.trim() ? (
                <Text style={{ fontWeight: '500', color: theme.textMuted }}>
                  {' '}
                  · {currentUser.city.trim()}
                </Text>
              ) : null}
            </Text>
            <View style={styles.modalListWrap}>
              <FlatList
                data={organizerVenues}
                keyExtractor={(v) => v.id}
                renderItem={renderVenueModalRow}
                ListEmptyComponent={
                  <Text style={[styles.muted, { color: theme.textMuted }]}>
                    {currentUser?.city?.trim()
                      ? `No hay centros registrados en ${currentUser.city.trim()}.`
                      : 'Completa la ciudad en tu perfil para ver centros disponibles.'}
                  </Text>
                }
              />
            </View>
            <Pressable
              style={styles.modalClose}
              onPress={() => setVenueModal(false)}
            >
              <Text style={[styles.modalCloseText, { color: theme.primary }]}>
                Cerrar
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function useThemedStyles() {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return { theme, styles }
}

function RevFieldIconLabel({
  icon,
  label,
  accent,
  labelColor,
}: {
  icon: ComponentProps<typeof Ionicons>['name']
  label: string
  accent: string
  labelColor: string
}) {
  const { styles } = useThemedStyles()
  return (
    <View style={styles.revFieldIconRow}>
      <Ionicons name={icon} size={18} color={accent} />
      <Text style={[styles.revFieldIconText, { color: labelColor }]}>{label}</Text>
    </View>
  )
}

function teamGenderLabel(gender: Team['gender']): string {
  return gender === 'female' ? 'Femenino' : 'Masculino'
}

function TeamSelectCard({
  team,
  selected,
  variant,
  layout,
  theme,
  onPress,
}: {
  team: Team
  selected: boolean
  variant: 'mine' | 'rival'
  layout: 'list' | 'hero'
  theme: ReturnType<typeof useScreenTheme>
  onPress: () => void
}) {
  const isHero = layout === 'hero'
  const accentColor = variant === 'rival' ? theme.danger : theme.primary
  const selectedBg =
    variant === 'rival'
      ? theme.isDark
        ? 'rgba(239, 68, 68, 0.12)'
        : 'rgba(239, 68, 68, 0.08)'
      : theme.selectedTint

  const logoSize = isHero ? 88 : 56
  const logoRadius = isHero ? 20 : 14

  return (
    <Pressable
      onPress={onPress}
      style={[
        isHero ? teamSelectStyles.heroCard : teamSelectStyles.listCard,
        {
          backgroundColor: theme.cardElevated,
          borderColor: selected ? accentColor : theme.border,
          shadowColor: selected ? accentColor : '#000',
        },
        selected && {
          borderWidth: 2,
          backgroundColor: selectedBg,
          shadowOpacity: theme.isDark ? 0.35 : 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: selected ? 4 : 0,
        },
        !selected && { borderWidth: 1 },
      ]}
    >
      {isHero ? (
        <View style={teamSelectStyles.heroInner}>
          <View
            style={[
              teamSelectStyles.logoRing,
              {
                borderColor: selected ? accentColor : theme.logoBoxBorder,
                backgroundColor: theme.logoBoxBg,
              },
            ]}
          >
            {team.logo ? (
              <Image
                source={{ uri: team.logo }}
                style={{ width: logoSize, height: logoSize, borderRadius: logoRadius }}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  teamSelectStyles.logoFallback,
                  { width: logoSize, height: logoSize, borderRadius: logoRadius },
                ]}
              >
                <Ionicons name="shield" size={36} color={theme.primaryAccent} />
              </View>
            )}
          </View>

          <Text style={[teamSelectStyles.heroName, { color: theme.text }]} numberOfLines={2}>
            {team.name}
          </Text>

          <View style={teamSelectStyles.metaChipRow}>
            <View
              style={[
                teamSelectStyles.metaChip,
                { backgroundColor: theme.chipBg, borderColor: theme.chipBorder },
              ]}
            >
              <Ionicons name="trophy-outline" size={14} color={theme.primaryAccent} />
              <Text style={[teamSelectStyles.metaChipText, { color: theme.text }]}>
                {levelLabel(team.level)}
              </Text>
            </View>
            <View
              style={[
                teamSelectStyles.metaChip,
                { backgroundColor: theme.chipBg, borderColor: theme.chipBorder },
              ]}
            >
              <Ionicons name="people-outline" size={14} color={theme.primaryAccent} />
              <Text style={[teamSelectStyles.metaChipText, { color: theme.text }]}>
                {team.members.length}/6 jugadores
              </Text>
            </View>
          </View>

          {team.city ? (
            <View style={teamSelectStyles.heroCityRow}>
              <Ionicons name="location-outline" size={15} color={theme.textMuted} />
              <Text style={[teamSelectStyles.heroCity, { color: theme.textMuted }]}>
                {team.city} · {teamGenderLabel(team.gender)}
              </Text>
            </View>
          ) : null}

          {selected ? (
            <View
              style={[
                teamSelectStyles.selectedPill,
                { backgroundColor: `${accentColor}22`, borderColor: accentColor },
              ]}
            >
              <Ionicons name="checkmark-circle" size={16} color={accentColor} />
              <Text style={[teamSelectStyles.selectedPillText, { color: accentColor }]}>
                Seleccionado para el desafío
              </Text>
            </View>
          ) : (
            <Text style={[teamSelectStyles.heroTapHint, { color: theme.textMuted }]}>
              Toca para seleccionar este equipo
            </Text>
          )}
        </View>
      ) : (
        <View style={teamSelectStyles.listRow}>
          <View
            style={[
              teamSelectStyles.listLogoBox,
              {
                backgroundColor: theme.logoBoxBg,
                borderColor: theme.logoBoxBorder,
              },
            ]}
          >
            {team.logo ? (
              <Image
                source={{ uri: team.logo }}
                style={teamSelectStyles.listLogoImg}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="shield" size={24} color={theme.primaryAccent} />
            )}
          </View>

          <View style={teamSelectStyles.listTextCol}>
            <Text style={[teamSelectStyles.listName, { color: theme.text }]} numberOfLines={1}>
              {team.name}
            </Text>
            <Text style={[teamSelectStyles.listMeta, { color: theme.textMuted }]}>
              {levelLabel(team.level)} · {team.members.length}/6
              {team.city ? ` · ${team.city}` : ''}
            </Text>
          </View>

          <View
            style={[
              teamSelectStyles.listCheck,
              {
                borderColor: selected ? accentColor : theme.border,
                backgroundColor: selected ? accentColor : 'transparent',
              },
            ]}
          >
            {selected ? (
              <Ionicons
                name="checkmark"
                size={16}
                color={variant === 'rival' ? '#fff' : theme.primaryBtnText}
              />
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  )
}

const teamSelectStyles = StyleSheet.create({
  heroCard: {
    marginTop: 8,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  heroInner: { alignItems: 'center' },
  logoRing: {
    padding: 4,
    borderRadius: 24,
    borderWidth: 2,
    marginBottom: 16,
  },
  logoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(102, 208, 111, 0.08)',
  },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  metaChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  metaChipText: { fontSize: 13, fontWeight: '600' },
  heroCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  heroCity: { fontSize: 13, fontWeight: '500' },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  selectedPillText: { fontSize: 13, fontWeight: '700' },
  heroTapHint: { fontSize: 13, marginTop: 8, fontWeight: '500' },
  listCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listLogoBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  listLogoImg: { width: 56, height: 56 },
  listTextCol: { flex: 1, minWidth: 0 },
  listName: { fontSize: 16, fontWeight: '800' },
  listMeta: { fontSize: 13, marginTop: 3, fontWeight: '500' },
  listCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

function TypeCard({
  title,
  desc,
  selected,
  onPress,
  tone,
  icon,
}: {
  title: string
  desc: string
  selected: boolean
  onPress: () => void
  tone: 'red' | 'blue' | 'teal' | 'gold'
  icon: keyof typeof Ionicons.glyphMap
}) {
  const { theme, styles } = useThemedStyles()
  const palette = useMemo(() => {
    switch (tone) {
      case 'red':
        return {
          accent: '#2563EB',
          selectedBg: theme.isDark ? 'rgba(37, 99, 235, 0.16)' : 'rgba(37, 99, 235, 0.08)',
          selectedBorder: '#2563EB',
          iconBg: theme.isDark ? 'rgba(37, 99, 235, 0.22)' : 'rgba(37, 99, 235, 0.12)',
        }
      case 'teal':
        return {
          accent: theme.primary,
          selectedBg: theme.selectedTint,
          selectedBorder: theme.primary,
          iconBg: theme.logoBoxBg,
        }
      case 'gold':
        return {
          accent: '#D97706',
          selectedBg: theme.isDark ? 'rgba(217, 119, 6, 0.16)' : 'rgba(245, 158, 11, 0.12)',
          selectedBorder: '#D97706',
          iconBg: theme.isDark ? 'rgba(217, 119, 6, 0.22)' : 'rgba(245, 158, 11, 0.14)',
        }
      default:
        return {
          accent: '#0EA5E9',
          selectedBg: theme.isDark ? 'rgba(14, 165, 233, 0.14)' : 'rgba(14, 165, 233, 0.08)',
          selectedBorder: '#0EA5E9',
          iconBg: theme.isDark ? 'rgba(14, 165, 233, 0.22)' : 'rgba(14, 165, 233, 0.12)',
        }
    }
  }, [theme, tone])

  const disabledTone = title === 'Buscar jugadores' && desc.includes('pausado')

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.typeCard,
        {
          backgroundColor: selected ? palette.selectedBg : theme.cardElevated,
          borderColor: selected ? palette.selectedBorder : theme.border,
          borderWidth: selected ? 2 : 1,
        },
        disabledTone && !selected && styles.typeCardMuted,
      ]}
    >
      <View style={styles.typeRow}>
        <View style={[styles.typeIconCircle, { backgroundColor: palette.iconBg }]}>
          <Ionicons name={icon} size={24} color={palette.accent} />
        </View>
        <View style={styles.typeTextCol}>
          <Text
            style={[
              styles.typeTitle,
              disabledTone && !selected && styles.typeTitleMuted,
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.typeDesc,
              disabledTone && !selected && styles.typeDescMuted,
            ]}
          >
            {desc}
          </Text>
        </View>
        <View
          style={[
            styles.typeRadio,
            selected
              ? { backgroundColor: palette.selectedBorder, borderColor: palette.selectedBorder }
              : { borderColor: theme.border },
          ]}
        >
          {selected ? (
            <Ionicons name="checkmark" size={16} color={theme.primaryBtnText} />
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

function VenueRow({
  label,
  venue,
  onPress,
}: {
  label: string
  venue: string
  onPress: () => void
}) {
  const { styles } = useThemedStyles()
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.pickerBtn} onPress={onPress}>
        <Text style={styles.pickerBtnText} numberOfLines={2}>
          {venue}
        </Text>
      </Pressable>
    </View>
  )
}

function LevelGrid({
  value,
  onChange,
  variant,
  accent,
  labelColor,
  mutedColor,
}: {
  value: Level
  onChange: (l: Level) => void
  variant: 'rival' | 'primary' | 'revuelta'
  accent?: string
  labelColor?: string
  mutedColor?: string
}) {
  const { theme, styles } = useThemedStyles()
  return (
    <View style={styles.levelGrid}>
      {LEVELS.map((lvl) => {
        const selected = value === lvl.value
        const revueltaSelected =
          variant === 'revuelta' && selected && accent
            ? {
                borderColor: accent,
                backgroundColor: `${accent}18`,
              }
            : null
        return (
          <Pressable
            key={lvl.value}
            style={[
              styles.levelCell,
              selected &&
                (variant === 'rival'
                  ? styles.levelCellRival
                  : variant === 'revuelta'
                    ? revueltaSelected
                    : styles.levelCellOn),
            ]}
            onPress={() => onChange(lvl.value)}
          >
            <Text
              style={[
                styles.levelCellText,
                variant === 'revuelta' &&
                  !selected && {
                    color: labelColor ?? mutedColor ?? theme.text,
                  },
                selected &&
                  (variant === 'revuelta' && accent
                    ? { color: accent, fontWeight: '800' }
                    : styles.levelCellTextOn),
              ]}
            >
              {lvl.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  gate: { padding: 24, textAlign: 'center', color: theme.textMuted },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  backBtn: {
    padding: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 22, color: theme.text },
  topBarText: { marginLeft: 8 },
  topTitle: { fontSize: 22, fontWeight: '800', color: theme.text },
  topSub: { fontSize: 13, color: theme.textMuted },
  stepProgressWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  stepProgressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stepProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: { gap: 12 },
  infoCard: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  infoTitle: { fontWeight: '700', marginBottom: 8, color: theme.text },
  infoLine: { fontSize: 12, color: theme.textMuted, marginBottom: 6 },
  h2: { fontSize: 20, fontWeight: '800', color: theme.text, marginTop: 4 },
  h2Sub: { fontSize: 16, marginTop: -6, marginBottom: 6 },
  typeCard: {
    padding: 16,
    borderRadius: 18,
    marginBottom: 4,
    overflow: 'hidden',
  },
  typeCardMuted: { opacity: 0.66 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTextCol: { flex: 1 },
  typeTitle: { fontSize: 17, fontWeight: '800', color: theme.text },
  typeTitleMuted: { color: theme.textMuted },
  typeDesc: { fontSize: 15, color: theme.textMuted, marginTop: 2 },
  typeDescMuted: { color: theme.textMuted },
  typeRadio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  dangerBtn: {
    backgroundColor: theme.danger,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: theme.primaryBtnText, fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.45 },
  teamCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 8,
  },
  teamCardOn: {
    borderColor: theme.primary,
    borderWidth: 2,
    backgroundColor: theme.selectedTint,
  },
  teamCardRivalOn: {
    borderColor: theme.danger,
    borderWidth: 2,
    backgroundColor: theme.isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)',
  },
  teamSelectListContent: { paddingTop: 8, paddingBottom: 4 },
  teamSelectHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  teamSelectHintText: { fontSize: 14, fontWeight: '600', flex: 1 },
  teamSelectEmptyHint: {
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  rivalModeRow: { gap: 10, marginTop: 4 },
  rivalModeCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 14,
  },
  rivalModeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  rivalModeTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  rivalModeDesc: { fontSize: 13, lineHeight: 18 },
  rivalOpenInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  rivalOpenInfoText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  rivalCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  rivalCityChipText: { fontSize: 13, fontWeight: '700' },
  rivalCityChipCount: { fontSize: 12, fontWeight: '600' },
  rivalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 12,
  },
  rivalSearchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
  rivalEmptyBox: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  rivalEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
  },
  rivalEmptyBody: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  rivalSelectedHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  rivalSelectedLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rivalSelectedLogoImg: { width: 40, height: 40 },
  rivalSelectedTextCol: { flex: 1, minWidth: 0 },
  rivalSelectedLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  rivalSelectedName: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  teamName: { fontSize: 16, fontWeight: '700', color: theme.text },
  teamMeta: { fontSize: 13, color: theme.textMuted, marginTop: 4 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
  },
  modeBtnOn: {
    borderColor: theme.primary,
    backgroundColor: theme.isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.08)',
  },
  modeBtnDirect: {
    borderColor: theme.danger,
    backgroundColor: theme.isDark ? 'rgba(220,38,38,0.14)' : 'rgba(220,38,38,0.08)',
  },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: theme.text },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: theme.bg,
  },
  textArea: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: theme.bg,
  },
  label: { fontSize: 14, fontWeight: '600', color: theme.text, marginTop: 8 },
  fieldBlock: { marginTop: 8 },
  pickerBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 14,
    backgroundColor: theme.bg,
  },
  pickerBtnText: { fontSize: 16, color: theme.text },
  vsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  vs: { fontSize: 20, fontWeight: '800', color: theme.accent },
  help: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
  altBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  altTitle: { fontSize: 14, fontWeight: '600', color: theme.text },
  altSub: { fontSize: 12, color: theme.textMuted, marginTop: 6 },
  altChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  altChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  altChipText: { fontSize: 12, color: theme.text },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelCell: {
    width: '47%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
  },
  levelCellOn: {
    borderColor: theme.primary,
    backgroundColor: theme.isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.08)',
  },
  levelCellRival: {
    borderColor: theme.danger,
    backgroundColor: theme.isDark ? 'rgba(220,38,38,0.14)' : 'rgba(220,38,38,0.08)',
  },
  levelCellText: { fontSize: 14, fontWeight: '600', color: theme.text },
  levelCellTextOn: { color: theme.text },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginVertical: 12,
  },
  counterBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: { fontSize: 24, fontWeight: '700' },
  counterVal: { fontSize: 32, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  seekCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.border,
    marginBottom: 8,
  },
  seekCardOn: {
    borderColor: theme.primary,
    backgroundColor: theme.isDark ? 'rgba(37,99,235,0.14)' : 'rgba(37,99,235,0.06)',
  },
  summaryBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: theme.chipBg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  summaryText: { fontSize: 14, color: theme.text },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  switchLabel: { fontSize: 14, color: theme.text, flex: 1 },
  muted: { fontSize: 14, color: theme.textMuted },
  success: { flex: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },
  successIcon: {
    fontSize: 48,
    color: theme.success,
    fontWeight: '800',
    marginBottom: 16,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: theme.text },
  successSub: {
    fontSize: 15,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.overlay,
  },
  modalSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalListWrap: {
    maxHeight: 340,
  },
  embeddedListWrap: {
    maxHeight: 380,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  modalRow: { paddingVertical: 14, paddingHorizontal: 16 },
  modalRowText: { fontSize: 16, color: theme.text },
  modalClose: { padding: 16, alignItems: 'center' },
  modalCloseText: { color: theme.link, fontSize: 16, fontWeight: '600' },
  teamPickTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 12,
  },
  teamPickTypeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamPickTypeTextCol: {
    flex: 1,
    paddingHorizontal: 12,
  },
  teamPickTypeTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  teamPickTypeDesc: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  teamPickRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  teamPickDetailSheet: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginTop: 4,
  },
  teamPickHeroTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 26,
  },
  teamPickHeroSub: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
  },
  teamPickRoleCell: {
    width: '47%',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  teamPickRoleCellText: {
    fontSize: 14,
    fontWeight: '700',
  },
  teamPickColorsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  teamPickColorCol: {
    flex: 1,
    minWidth: 0,
  },
  teamPickColorCard: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  teamPickColorColTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  teamPickShieldGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamPickShieldOuter: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamPickShieldOuterOn: {
    borderWidth: 2,
  },
  teamPickPublishBtn: {
    marginTop: 22,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  teamPickPublishText: {
    color: theme.primaryBtnText,
    fontSize: 17,
    fontWeight: '800',
  },
  revueltaCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginTop: 4,
  },
  revueltaFieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  revueltaHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    marginTop: -4,
  },
  revueltaInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  revueltaTextArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 96,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  revueltaCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginVertical: 8,
  },
  revueltaCounterBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revueltaCounterBtnText: {
    fontSize: 26,
    fontWeight: '600',
  },
  revueltaCounterVal: {
    fontSize: 36,
    fontWeight: '800',
    minWidth: 52,
    textAlign: 'center',
  },
  revueltaRoleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  revueltaRoleBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
  },
  revueltaRoleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  revueltaPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  revueltaPickerCompact: {
    flex: 1,
    minHeight: 48,
  },
  revueltaPickerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  revueltaSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 4,
  },
  revueltaSwitchLabel: {
    fontSize: 14,
    flex: 1,
    paddingRight: 12,
    fontWeight: '500',
  },
  revueltaDateTimeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  revueltaDateTimeCol: {
    flex: 1,
  },
  revueltaMiniLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  revueltaMiniLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  revueltaPublishBtn: {
    marginTop: 22,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  revueltaPublishText: {
    fontSize: 17,
    fontWeight: '800',
  },
  revFieldIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  revFieldIconText: {
    fontSize: 15,
    fontWeight: '700',
  },
})
}
