import { Ionicons } from '@expo/vector-icons'
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list'
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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useApp } from '../lib/app-provider'
import { useThemePreference } from '../lib/theme-context'
import { createClient, isSupabaseConfigured } from '../lib/supabase/client'
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
  const { tokens, resolved } = useThemePreference()
  const isDark = resolved === 'dark'

  const revueltaUi = useMemo(
    () => ({
      text: tokens.textPrimary,
      muted: tokens.textMuted,
      border: tokens.borderDark,
      inputBg: isDark ? '#16181c' : '#f4f4f5',
      surface: isDark ? '#1c1f26' : '#ffffff',
      onPrimary: '#0a0d08',
      subtleIcon: isDark ? 'rgba(47,158,68,0.9)' : tokens.primaryGreen,
      /** Detalles team pick (mock mint / bosque). */
      teamPickMintField: isDark ? 'rgba(55,214,122,0.1)' : '#E8F5E9',
      teamPickRoleOffBg: isDark ? '#14171d' : '#FFFFFF',
      teamPickRoleOnBg: '#166534',
      teamPickRoleOnText: '#FFFFFF',
    }),
    [tokens, isDark]
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
  const [timeModal, setTimeModal] = useState(false)
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
    void fetchSportsVenuesList(createClient()).then(setSportsVenuesFromDb)
  }, [])

  useEffect(() => {
    if (!currentUser || sportsVenuesFromDb.length === 0) return
    if (venuePrefillAppliedRef.current) return
    void (async () => {
      const prefill = await readCreatePrefill()
      if (!prefill) return
      const venue = sportsVenuesFromDb.find((v) => v.id === prefill.sportsVenueId)
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
  }, [currentUser?.id, sportsVenuesFromDb])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const tid = await consumeRivalTargetTeamId()
      if (!tid || cancelled || !currentUser) return
      const others = getFilteredTeams(currentUser.gender)
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
      const supabase = createClient()
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
      const supabase = createClient()
      const dayStart = new Date(`${formData.date}T00:00:00`)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const dow = dayStart.getDay()
      const targetTime = formData.time
      const candidates = sportsVenuesFromDb.filter((v) => v.id !== linkedVenueId)
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
    sportsVenuesFromDb,
  ])

  const userTeams = getUserTeams()
  const allTeams = currentUser ? getFilteredTeams(currentUser.gender) : []
  const rivalTeams = allTeams
    .filter(
      (t) => t.id !== selectedTeam?.id && !userTeams.some((ut) => ut.id === t.id)
    )
    .filter((t) => t.name.toLowerCase().includes(rivalSearch.toLowerCase()))

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
        <Text style={[styles.modalRowText, { color: tokens.textPrimary }]}>
          {item.name} — {item.city}
        </Text>
      </Pressable>
    ),
    [onVenuePick, tokens.textPrimary]
  )

  const renderTimeModalRow = useCallback(
    ({ item }: ListRenderItemInfo<{ value: string; label: string }>) => (
      <Pressable
        style={styles.modalRow}
        onPress={() => {
          setBookingNoCourt(false)
          setFormData((f) => ({ ...f, time: item.value }))
          setTimeModal(false)
        }}
      >
        <Text style={[styles.modalRowText, { color: tokens.textPrimary }]}>
          {item.label}
        </Text>
      </Pressable>
    ),
    [tokens.textPrimary]
  )

  const renderUserTeamRow = useCallback(
    ({ item: team }: ListRenderItemInfo<Team>) => (
      <Pressable
        style={[
          styles.teamCard,
          selectedTeam?.id === team.id && styles.teamCardOn,
        ]}
        onPress={() => setSelectedTeam(team)}
      >
        <Text style={styles.teamName}>{team.name}</Text>
        <Text style={styles.teamMeta}>
          {levelLabel(team.level)} · {team.members.length}/6
        </Text>
      </Pressable>
    ),
    [selectedTeam]
  )

  const renderRivalTeamRow = useCallback(
    ({ item: team }: ListRenderItemInfo<Team>) => (
      <Pressable
        style={[
          styles.teamCard,
          selectedRivalTeam?.id === team.id && styles.teamCardRivalOn,
        ]}
        onPress={() => setSelectedRivalTeam(team)}
      >
        <Text style={styles.teamName}>{team.name}</Text>
        <Text style={styles.teamMeta}>{levelLabel(team.level)}</Text>
      </Pressable>
    ),
    [selectedRivalTeam]
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
                backgroundColor: isDark
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(245, 158, 11, 0.14)',
                borderColor: isDark
                  ? 'rgba(245, 158, 11, 0.42)'
                  : 'rgba(245, 158, 11, 0.35)',
              },
            ]}
          >
            <Text style={[styles.altTitle, { color: tokens.textPrimary }]}>
              {bookingNoCourt
                ? `Se ocupó el último cupo a las ${labelForHm(formData.time)}.`
                : `Este centro no tiene cupo a las ${labelForHm(formData.time)}.`}
            </Text>
            {loadingAlternativeVenues ? (
              <Text style={[styles.altSub, { color: tokens.textMuted }]}>
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
                        backgroundColor: tokens.cardDark,
                        borderColor: tokens.borderDark,
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
                      style={[styles.altChipText, { color: tokens.textPrimary }]}
                    >
                      {v.name} — {v.city}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.altSub, { color: tokens.textMuted }]}>
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
      isDark,
      linkedVenueId,
      loadingAlternativeVenues,
      shouldSuggestAlternatives,
      tokens.borderDark,
      tokens.cardDark,
      tokens.textMuted,
      tokens.textPrimary,
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
      Alert.alert('Fecha u hora inválida', 'Usa fecha AAAA-MM-DD y hora del listado.')
      return
    }

    setSubmitting(true)
    try {
      if (matchType === 'team_pick_flow') {
        const supabase = createClient()
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
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]}>
        <Text style={[styles.gate, { color: tokens.textMuted }]}>
          Solo jugadores pueden publicar partidos aquí.
        </Text>
      </SafeAreaView>
    )
  }

  if (isSubmitted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]}>
        <View style={styles.success}>
          <Text style={[styles.successIcon, { color: tokens.primaryGreen }]}>
            ✓
          </Text>
          <Text style={[styles.successTitle, { color: tokens.textPrimary }]}>
            {matchType === 'reserve' ? 'Reserva creada' : '¡Publicado!'}
          </Text>
          <Text style={[styles.successSub, { color: tokens.textMuted }]}>
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
            style={[styles.primaryBtn, { backgroundColor: tokens.primaryGreen }]}
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

  const dateTimeValid = formData.date.length >= 8 && formData.time.length >= 4

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
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
      <View
        style={[
          styles.topBar,
          { borderBottomColor: tokens.borderDark },
        ]}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={[
            styles.backBtn,
            {
              backgroundColor:
                resolved === 'dark' ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
              borderColor: tokens.borderDark,
            },
          ]}
        >
          <Text style={[styles.backBtnText, { color: tokens.textPrimary }]}>
            ←
          </Text>
        </Pressable>
        <View style={styles.topBarText}>
          <Text style={[styles.topTitle, { color: tokens.textPrimary }]}>
            {topTitle}
          </Text>
          <Text style={[styles.topSub, { color: tokens.textMuted }]}>{topSub}</Text>
        </View>
      </View>
      <View style={styles.stepProgressWrap}>
        <View
          style={[
            styles.stepProgressTrack,
            {
              backgroundColor:
                resolved === 'dark' ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
            },
          ]}
        >
          <View
            style={[
              styles.stepProgressFill,
              {
                width: `${Math.max(12, Math.round((step / totalSteps) * 100))}%`,
                backgroundColor: tokens.primaryGreen,
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
            <Text style={[styles.h2Sub, { color: tokens.textMuted }]}>
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
            <TypeCard
              title="Solo reservar cancha"
              desc="Sin crear partido"
              selected={matchType === 'reserve'}
              onPress={() => setMatchType('reserve')}
              tone="blue"
              icon="calendar-outline"
            />
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
                      ? tokens.primaryGreen
                      : revueltaUi.border,
                },
              ]}
              onPress={() => setTeamPickKind('team_pick_public')}
            >
              <View
                style={[
                  styles.teamPickTypeIconBox,
                  { backgroundColor: `${tokens.primaryGreen}22` },
                ]}
              >
                <Ionicons name="globe-outline" size={22} color={tokens.primaryGreen} />
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
                        ? tokens.primaryGreen
                        : revueltaUi.border,
                  },
                  teamPickKind === 'team_pick_public' && {
                    backgroundColor: tokens.primaryGreen,
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
                      ? tokens.danger
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
                <Ionicons name="lock-closed-outline" size={22} color={tokens.danger} />
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
                        ? tokens.danger
                        : revueltaUi.border,
                  },
                  teamPickKind === 'team_pick_private' && {
                    backgroundColor: tokens.danger,
                  },
                ]}
              />
            </Pressable>
            <Pressable
              style={[
                styles.revueltaPublishBtn,
                { backgroundColor: tokens.primaryGreen, marginTop: 20 },
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
            <View style={styles.embeddedListWrap}>
              <FlashList
                data={userTeams}
                keyExtractor={(t) => t.id}
                renderItem={renderUserTeamRow}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              />
            </View>
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
            <View style={styles.modeRow}>
              <Pressable
                style={[
                  styles.modeBtn,
                  rivalMode === 'open' && styles.modeBtnOn,
                ]}
                onPress={() => {
                  setRivalMode('open')
                  setSelectedRivalTeam(null)
                }}
              >
                <Text style={styles.modeBtnText}>Búsqueda abierta</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modeBtn,
                  rivalMode === 'direct' && styles.modeBtnDirect,
                ]}
                onPress={() => setRivalMode('direct')}
              >
                <Text style={styles.modeBtnText}>Equipo específico</Text>
              </Pressable>
            </View>
            {rivalMode === 'direct' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Buscar equipo…"
                  value={rivalSearch}
                  onChangeText={setRivalSearch}
                />
                {rivalTeams.length === 0 ? (
                  <Text style={styles.muted}>No hay equipos con ese criterio.</Text>
                ) : (
                  <View style={styles.embeddedListWrap}>
                    <FlashList
                      data={rivalTeams}
                      keyExtractor={(t) => t.id}
                      renderItem={renderRivalTeamRow}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    />
                  </View>
                )}
              </>
            )}
            <Pressable
              style={[
                styles.dangerBtn,
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
            <Text style={styles.label}>Fecha (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={formData.date}
              onChangeText={(t) => {
                setBookingNoCourt(false)
                setFormData({ ...formData, date: t })
              }}
              placeholder="2026-04-15"
            />
            <TimeRow
              label="Hora"
              valueLabel={
                timeOptionsForPicker.find((x) => x.value === formData.time)
                  ?.label ?? 'Elegir'
              }
              loading={!!linkedVenueId && !!formData.date && loadingVenueTimes}
              onPress={() => setTimeModal(true)}
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
                <ActivityIndicator color="#fff" />
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
                        backgroundColor: tokens.primaryGreen,
                        borderColor: tokens.primaryGreen,
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
                        backgroundColor: tokens.primaryGreen,
                        borderColor: tokens.primaryGreen,
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
                        false: isDark ? '#3f3f46' : '#d4d4d8',
                        true: tokens.primaryGreen,
                      }}
                      thumbColor={isDark ? '#fafafa' : '#fff'}
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
                    <TextInput
                      style={[
                        styles.revueltaInput,
                        {
                          backgroundColor: revueltaUi.inputBg,
                          borderColor: revueltaUi.border,
                          color: revueltaUi.text,
                        },
                      ]}
                      value={formData.date}
                      onChangeText={(t) => {
                        setBookingNoCourt(false)
                        setFormData({ ...formData, date: t })
                      }}
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor={revueltaUi.muted}
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
                    <Pressable
                      style={[
                        styles.revueltaPicker,
                        styles.revueltaPickerCompact,
                        {
                          backgroundColor: revueltaUi.inputBg,
                          borderColor: revueltaUi.border,
                        },
                      ]}
                      onPress={() => setTimeModal(true)}
                    >
                      {linkedVenueId && formData.date && loadingVenueTimes ? (
                        <ActivityIndicator color={tokens.primaryGreen} />
                      ) : (
                        <Text
                          style={[
                            styles.revueltaPickerText,
                            {
                              color:
                                formData.time && selectedVenueHasChosenTime
                                  ? revueltaUi.text
                                  : revueltaUi.muted,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {timeOptionsForPicker.find(
                            (x) => x.value === formData.time
                          )?.label ?? 'Selecciona la hora'}
                        </Text>
                      )}
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={revueltaUi.muted}
                      />
                    </Pressable>
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
                  accent={tokens.primaryGreen}
                  labelColor={revueltaUi.text}
                  mutedColor={revueltaUi.muted}
                />
                <Pressable
                  style={[
                    styles.revueltaPublishBtn,
                    {
                      backgroundColor: tokens.primaryGreen,
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
                <Text style={styles.label}>Fecha (AAAA-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.date}
                  onChangeText={(t) => {
                    setBookingNoCourt(false)
                    setFormData({ ...formData, date: t })
                  }}
                />
                <TimeRow
                  label="Hora"
                  valueLabel={
                    timeOptionsForPicker.find((x) => x.value === formData.time)
                      ?.label ?? 'Elegir'
                  }
                  loading={!!linkedVenueId && !!formData.date && loadingVenueTimes}
                  onPress={() => setTimeModal(true)}
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
                    <ActivityIndicator color="#fff" />
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
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.06)'
                          : '#F3F4F6',
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
                                  ? tokens.primaryGreen
                                  : revueltaUi.border,
                                backgroundColor: whiteKit
                                  ? isDark
                                    ? '#4b5563'
                                    : '#E5E7EB'
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
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.06)'
                          : '#F3F4F6',
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
                                  ? tokens.primaryGreen
                                  : revueltaUi.border,
                                backgroundColor: whiteKit
                                  ? isDark
                                    ? '#4b5563'
                                    : '#E5E7EB'
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
                      false: isDark ? '#3f3f46' : '#d4d4d8',
                      true: tokens.primaryGreen,
                    }}
                    thumbColor={isDark ? '#fafafa' : '#fff'}
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
                  <TextInput
                    style={[
                      styles.revueltaInput,
                      {
                        backgroundColor: revueltaUi.teamPickMintField,
                        borderColor: revueltaUi.border,
                        color: revueltaUi.text,
                      },
                    ]}
                    value={formData.date}
                    onChangeText={(t) => {
                      setBookingNoCourt(false)
                      setFormData({ ...formData, date: t })
                    }}
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor={revueltaUi.muted}
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
                  <Pressable
                    style={[
                      styles.revueltaPicker,
                      styles.revueltaPickerCompact,
                      {
                        backgroundColor: revueltaUi.teamPickMintField,
                        borderColor: revueltaUi.border,
                      },
                    ]}
                    onPress={() => setTimeModal(true)}
                  >
                    {linkedVenueId && formData.date && loadingVenueTimes ? (
                      <ActivityIndicator color={tokens.primaryGreen} />
                    ) : (
                      <Text
                        style={[
                          styles.revueltaPickerText,
                          {
                            color:
                              formData.time && selectedVenueHasChosenTime
                                ? revueltaUi.text
                                : revueltaUi.muted,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {timeOptionsForPicker.find((x) => x.value === formData.time)
                          ?.label ?? 'Selecciona la hora'}
                      </Text>
                    )}
                    <Ionicons name="chevron-down" size={18} color={revueltaUi.muted} />
                  </Pressable>
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
                accent={tokens.primaryGreen}
                labelColor={revueltaUi.text}
                mutedColor={revueltaUi.muted}
              />
              <Pressable
                style={[
                  styles.teamPickPublishBtn,
                  { backgroundColor: tokens.primaryGreen },
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
                  <ActivityIndicator color="#FFFFFF" />
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
            <TextInput
              style={styles.input}
              value={formData.date}
              onChangeText={(t) => {
                setBookingNoCourt(false)
                setFormData({ ...formData, date: t })
              }}
            />
            <TimeRow
              label="Hora"
              valueLabel={
                timeOptionsForPicker.find((x) => x.value === formData.time)
                  ?.label ?? 'Elegir'
              }
              loading={!!linkedVenueId && !!formData.date && loadingVenueTimes}
              onPress={() => setTimeModal(true)}
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
                backgroundColor: tokens.cardDark,
                borderTopColor: tokens.borderDark,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: tokens.textPrimary, borderBottomColor: tokens.borderDark },
              ]}
            >
              Centro deportivo
            </Text>
            <View style={styles.modalListWrap}>
              <FlashList
                data={sportsVenuesFromDb}
                keyExtractor={(v) => v.id}
                renderItem={renderVenueModalRow}
                ListEmptyComponent={
                  <Text style={[styles.muted, { color: tokens.textMuted }]}>
                    No hay centros registrados.
                  </Text>
                }
              />
            </View>
            <Pressable
              style={styles.modalClose}
              onPress={() => setVenueModal(false)}
            >
              <Text style={[styles.modalCloseText, { color: tokens.primaryGreen }]}>
                Cerrar
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={timeModal} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: tokens.cardDark,
                borderTopColor: tokens.borderDark,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: tokens.textPrimary, borderBottomColor: tokens.borderDark },
              ]}
            >
              Hora
            </Text>
            {linkedVenueId && formData.date && loadingVenueTimes ? (
              <ActivityIndicator style={{ margin: 24 }} color={tokens.primaryGreen} />
            ) : (
              <View style={styles.modalListWrap}>
                <FlashList
                  data={timeOptionsForPicker}
                  keyExtractor={(x) => x.value}
                  renderItem={renderTimeModalRow}
                  ListEmptyComponent={
                    <Text style={[styles.muted, { color: tokens.textMuted }]}>
                      Sin horarios.
                    </Text>
                  }
                />
              </View>
            )}
            <Pressable
              style={styles.modalClose}
              onPress={() => setTimeModal(false)}
            >
              <Text style={[styles.modalCloseText, { color: tokens.primaryGreen }]}>
                Cerrar
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
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
  return (
    <View style={styles.revFieldIconRow}>
      <Ionicons name={icon} size={18} color={accent} />
      <Text style={[styles.revFieldIconText, { color: labelColor }]}>{label}</Text>
    </View>
  )
}

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
  const { resolved } = useThemePreference()
  const isDark = resolved === 'dark'
  const border =
    tone === 'red'
      ? styles.typeRed
      : tone === 'teal'
        ? styles.typeTeal
        : tone === 'gold'
          ? styles.typeGold
          : styles.typeBlue
  const accent =
    tone === 'red'
      ? '#3B82F6'
      : tone === 'teal'
        ? '#0F4539'
        : tone === 'gold'
          ? '#D9A429'
          : '#36A2EB'
  const cardBg = isDark ? '#12161B' : '#FFFFFF'
  const cardBorder = isDark ? '#29303A' : '#E5E7EB'
  const iconBg = isDark ? `${accent}22` : `${accent}20`
  const disabledTone = title === 'Buscar jugadores' && desc.includes('pausado')
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.typeCard,
        { backgroundColor: cardBg, borderColor: cardBorder },
        selected && border,
        disabledTone && !selected && styles.typeCardMuted,
      ]}
    >
      <View style={styles.typeRow}>
        <View style={[styles.typeIconCircle, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={24} color={accent} />
        </View>
        <View style={styles.typeTextCol}>
          <Text
            style={[
              styles.typeTitle,
              isDark && { color: '#F3F4F6' },
              disabledTone && !selected && styles.typeTitleMuted,
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.typeDesc,
              isDark && { color: '#9CA3AF' },
              disabledTone && !selected && styles.typeDescMuted,
            ]}
          >
            {desc}
          </Text>
        </View>
        {selected ? (
          <View style={[styles.typeCheck, { backgroundColor: '#7DD064' }]}>
            <Ionicons name="checkmark" size={16} color="#102015" />
          </View>
        ) : null}
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

function TimeRow({
  label,
  valueLabel,
  loading,
  onPress,
}: {
  label: string
  valueLabel: string
  loading?: boolean
  onPress: () => void
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.pickerBtn} onPress={onPress}>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.pickerBtnText}>{valueLabel}</Text>
        )}
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
                    color: labelColor ?? mutedColor ?? '#374151',
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  gate: { padding: 24, textAlign: 'center', color: '#6b7280' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
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
  backBtnText: { fontSize: 22, color: '#374151' },
  topBarText: { marginLeft: 8 },
  topTitle: { fontSize: 22, fontWeight: '800', color: '#111' },
  topSub: { fontSize: 13, color: '#6b7280' },
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
  infoTitle: { fontWeight: '700', marginBottom: 8, color: '#111' },
  infoLine: { fontSize: 12, color: '#4b5563', marginBottom: 6 },
  h2: { fontSize: 20, fontWeight: '800', color: '#111', marginTop: 4 },
  h2Sub: { fontSize: 16, marginTop: -6, marginBottom: 6 },
  typeCard: {
    padding: 14,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    marginBottom: 2,
  },
  typeRed: {
    borderColor: '#86D272',
    backgroundColor: 'rgba(125, 208, 100, 0.10)',
    shadowColor: '#66D06F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  typeBlue: {
    borderColor: '#5BB7EA',
    backgroundColor: 'rgba(54,162,235,0.10)',
  },
  typeTeal: {
    borderColor: '#86D272',
    backgroundColor: 'rgba(125, 208, 100, 0.10)',
    shadowColor: '#66D06F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  typeGold: {
    borderColor: '#E1BC63',
    backgroundColor: 'rgba(217,164,41,0.11)',
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
  typeTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  typeTitleMuted: { color: '#6B7280' },
  typeDesc: { fontSize: 15, color: '#6b7280', marginTop: 2 },
  typeDescMuted: { color: '#9CA3AF' },
  typeCheck: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: '#0F4539',
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#0F4539',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  dangerBtn: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.45 },
  teamCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  teamCardOn: { borderColor: '#2563eb', borderWidth: 2 },
  teamCardRivalOn: { borderColor: '#dc2626', borderWidth: 2 },
  teamName: { fontSize: 16, fontWeight: '700', color: '#111' },
  teamMeta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  modeBtnOn: { borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)' },
  modeBtnDirect: {
    borderColor: '#dc2626',
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: '#111' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: '#f9fafb',
  },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 8 },
  fieldBlock: { marginTop: 8 },
  pickerBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#f9fafb',
  },
  pickerBtnText: { fontSize: 16, color: '#111' },
  vsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  vs: { fontSize: 20, fontWeight: '800', color: '#0891b2' },
  help: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  altBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  altTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  altSub: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  altChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  altChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  altChipText: { fontSize: 12, color: '#111' },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelCell: {
    width: '47%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  levelCellOn: { borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)' },
  levelCellRival: {
    borderColor: '#dc2626',
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  levelCellText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  levelCellTextOn: { color: '#111' },
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
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: { fontSize: 24, fontWeight: '700' },
  counterVal: { fontSize: 32, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  seekCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  seekCardOn: { borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.06)' },
  summaryBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryText: { fontSize: 14, color: '#374151' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  switchLabel: { fontSize: 14, color: '#374151', flex: 1 },
  muted: { fontSize: 14, color: '#6b7280' },
  success: { flex: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },
  successIcon: {
    fontSize: 48,
    color: '#16a34a',
    fontWeight: '800',
    marginBottom: 16,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#111' },
  successSub: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: '#fff',
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
    borderBottomColor: '#e5e7eb',
  },
  modalRow: { paddingVertical: 14, paddingHorizontal: 16 },
  modalRowText: { fontSize: 16, color: '#111' },
  modalClose: { padding: 16, alignItems: 'center' },
  modalCloseText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
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
    color: '#FFFFFF',
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
