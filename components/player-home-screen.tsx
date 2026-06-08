import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { HomeMatchCard } from './home-match-card'
import { JoinPlayersModal } from './join-players-modal'
import { JoinRevueltaModal } from './join-revuelta-modal'
import { MatchJoinSuccessModal } from './match-join-success-modal'
import { JoinTeamPickModal } from './join-team-pick-modal'
import { RivalTeamPickerModal } from './rival-team-picker-modal'
import { APP_LOGO } from '../lib/app-brand-assets'
import { alertJoinResult } from '../lib/alert-join-result'
import { matchInviteSharePayload } from '../lib/match-invite-share'
import { startOfToday } from '../lib/format-match'
import { useApp } from '../lib/app-provider'
import { useUnreadNotificationsCount } from '../lib/hooks/use-unread-notifications'
import { useThemePreference } from '../lib/theme-context'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import { fetchGeoCities, type GeoCity } from '../lib/supabase/geo-queries'
import { DEFAULT_AVATAR } from '../lib/supabase/mappers'
import { useMatchCourtCosts } from '../lib/use-match-court-costs'
import type { MatchOpportunity, MatchType } from '../lib/types'

type FilterType = 'all' | MatchType

function normalizeLocation(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isTeamPickType(type: MatchType): boolean {
  return (
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

export function PlayerHomeScreen() {
  const {
    currentUser,
    getFilteredMatches,
    getUserTeams,
    joinMatchOpportunity,
    acceptRivalOpportunityWithTeam,
    participatingOpportunityIds,
    resolveTeamPickPrivateJoinCode,
  } = useApp()

  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [revueltaJoinOpp, setRevueltaJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [teamPickJoinOpp, setTeamPickJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [teamPickInitialCode, setTeamPickInitialCode] = useState('')
  const [playersJoinOpp, setPlayersJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [rivalPickOppId, setRivalPickOppId] = useState<string | null>(null)
  const [joinSuccessVisible, setJoinSuccessVisible] = useState(false)
  const [joinSuccessTitle, setJoinSuccessTitle] = useState<string | undefined>()
  const [joinedAsGoalkeeper, setJoinedAsGoalkeeper] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [teamPrivateCode, setTeamPrivateCode] = useState('')
  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  const [regionCities, setRegionCities] = useState<GeoCity[]>([])
  const privateCodeInputRef = useRef<TextInput | null>(null)
  const { resolved, setPreference } = useThemePreference()
  const { count: unreadNotifications, refresh: refreshUnreadNotifications } =
    useUnreadNotificationsCount(currentUser?.id)
  const isDark = resolved === 'dark'
  const ui = isDark
    ? {
        bg: '#090B0A',
        card: '#141717',
        cardBorder: '#2C3131',
        text: '#F5F7F7',
        textMuted: '#9CA3A3',
        icon: '#F5F7F7',
        inputBg: '#090B0A',
        sectionLink: '#7BE7C0',
        emptyBg: '#0f1313',
      }
    : {
        bg: '#F4F7F2',
        card: '#EEF3EC',
        cardBorder: '#C5D1C2',
        text: '#1F2A22',
        textMuted: '#667267',
        icon: '#6E7672',
        inputBg: '#F9FBF8',
        sectionLink: '#0F4539',
        emptyBg: '#D2D8D1',
      }

  const midnight = useMemo(() => startOfToday(), [])
  const userCityNormalized = normalizeLocation(currentUser?.city)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const regionId = currentUser?.homeRegionId
      if (!regionId || !isSupabaseConfigured()) {
        if (!cancelled) setRegionCities([])
        return
      }
      const cities = await fetchGeoCities(getSupabase(), regionId)
      if (!cancelled) setRegionCities(cities)
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser?.homeRegionId])

  useEffect(() => {
    setSelectedCity(null)
  }, [currentUser?.homeRegionId])

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadNotifications()
    }, [refreshUnreadNotifications])
  )

  const regionCityNamesNormalized = useMemo(
    () => new Set(regionCities.map((c) => normalizeLocation(c.name))),
    [regionCities]
  )

  const cityOptions = useMemo(
    () => regionCities.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'es')),
    [regionCities]
  )

  const matches = useMemo(() => {
    if (!currentUser) return []
    const base = getFilteredMatches(currentUser.gender).filter(
      (m) => m.status === 'pending' || m.status === 'confirmed'
    )
    if (regionCityNamesNormalized.size > 0) {
      return base.filter((m) =>
        regionCityNamesNormalized.has(normalizeLocation(m.location))
      )
    }
    return base.filter(
      (m) =>
        userCityNormalized === '' ||
        normalizeLocation(m.location) === userCityNormalized
    )
  }, [
    currentUser,
    getFilteredMatches,
    regionCityNamesNormalized,
    userCityNormalized,
  ])

  const visibleMatches = useMemo(
    () => matches.filter((m) => m.dateTime.getTime() >= midnight.getTime()),
    [matches, midnight]
  )

  const filteredMatches = useMemo(() => {
    if (activeFilter === 'all') return visibleMatches
    if (isTeamPickType(activeFilter)) {
      return visibleMatches.filter((m) => isTeamPickType(m.type))
    }
    return visibleMatches.filter((m) => m.type === activeFilter)
  }, [visibleMatches, activeFilter])

  const listMatches = useMemo(() => {
    if (!selectedCity) return filteredMatches
    const norm = normalizeLocation(selectedCity)
    return filteredMatches.filter(
      (m) => normalizeLocation(m.location) === norm
    )
  }, [filteredMatches, selectedCity])

  const courtCostsByMatchId = useMatchCourtCosts(listMatches)

  const captainTeams = useMemo(() => {
    if (!currentUser) return []
    return getUserTeams().filter((t) => t.captainId === currentUser.id)
  }, [currentUser, getUserTeams])

  const firstName =
    currentUser?.name?.split(/\s+/)[0]?.trim() || 'Jugador'

  const avatarUri = currentUser?.photo || DEFAULT_AVATAR

  const handleJoin = async (
    opportunityId: string,
    isOwn: boolean,
    type: MatchType
  ) => {
    if (isOwn) {
      router.push(`/partidos/${opportunityId}`)
      return
    }

    if (type === 'rival') {
      if (captainTeams.length === 0) {
        router.push('/equipos')
        return
      }
      if (captainTeams.length === 1) {
        const res = await acceptRivalOpportunityWithTeam(
          opportunityId,
          captainTeams[0].id
        )
        if (!res.ok && res.error) Alert.alert('No se pudo desafiar', res.error)
        if (res.ok) {
          Alert.alert(
            'Listo',
            'Desafío aceptado. Coordina en Partidos → Chats o abre el chat desde el detalle del partido.'
          )
        }
      } else {
        setRivalPickOppId(opportunityId)
      }
      return
    }

    if (type === 'open') {
      const m = listMatches.find((x) => x.id === opportunityId)
      if (m) setRevueltaJoinOpp(m)
      return
    }

    if (isTeamPickType(type)) {
      const m = listMatches.find((x) => x.id === opportunityId)
      if (m) {
        setTeamPickInitialCode('')
        setTeamPickJoinOpp(m)
      }
      return
    }

    if (type === 'players') {
      const m = listMatches.find((x) => x.id === opportunityId)
      if (m) setPlayersJoinOpp(m)
      return
    }

    setJoiningId(opportunityId)
    try {
      const r = await joinMatchOpportunity(opportunityId)
      if (r.ok) {
        const m = listMatches.find((x) => x.id === opportunityId)
        if (m) showJoinSuccess(m)
      } else {
        alertJoinResult(r)
      }
    } finally {
      setJoiningId(null)
    }
  }

  const showJoinSuccess = (match: MatchOpportunity, asGk?: boolean) => {
    setJoinSuccessTitle(match.title)
    setJoinedAsGoalkeeper(asGk === true)
    setJoinSuccessVisible(true)
  }

  const shareRevuelta = (match: MatchOpportunity) => {
    const joined = match.playersJoined ?? 0
    const slotsLeft =
      match.playersNeeded != null
        ? Math.max(0, match.playersNeeded - joined)
        : undefined
    const { message, url, title } = matchInviteSharePayload(match, { slotsLeft })
    void Share.share({ message, url, title })
  }

  const toggleTheme = () => {
    void setPreference(resolved === 'dark' ? 'light' : 'dark')
  }

  const onSearchPrivateCode = () => {
    const code = teamPrivateCode.replace(/\D/g, '').slice(0, 4)
    if (code.length < 4) {
      Alert.alert('Código', 'Ingresa un código de 4 dígitos.')
      return
    }
    void (async () => {
      const resolvedCode = await resolveTeamPickPrivateJoinCode(code)
      if (resolvedCode.ok && resolvedCode.matchId) {
        router.push({
          pathname: `/partidos/${resolvedCode.matchId}`,
          params: { joinCode: code },
        })
        setTeamPrivateCode('')
        return
      }
      Alert.alert(
        'Sin coincidencia',
        resolvedCode.error ??
          'No encontramos un partido de selección de equipos con ese código. Revisa en Explorar o pide el enlace al organizador.'
      )
    })()
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]} edges={['top']}>
      <ScrollView
        style={[styles.scroll, { backgroundColor: ui.bg }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.header,
            { borderBottomColor: ui.cardBorder, backgroundColor: ui.bg },
          ]}
        >
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.brandMark,
                { backgroundColor: ui.card, borderColor: ui.cardBorder },
              ]}
            >
              <Image
                source={APP_LOGO}
                style={styles.brandLogo}
                resizeMode="contain"
                accessibilityLabel="SportMatch"
              />
            </View>
            <View>
              <Text style={[styles.h1, { color: ui.text }]}>Hola, {firstName}</Text>
              <Text style={[styles.sub, { color: ui.textMuted }]}>
                Encuentra tu partido perfecto
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.iconBtn}
              onPress={toggleTheme}
              accessibilityLabel="Cambiar tema"
            >
              <Ionicons
                name={resolved === 'dark' ? 'sunny-outline' : 'moon-outline'}
                size={20}
                color={ui.icon}
              />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => router.push('/notificaciones')}
              accessibilityLabel="Notificaciones"
            >
              <Ionicons name="notifications-outline" size={22} color={ui.icon} />
              {unreadNotifications > 0 ? (
                <View
                  style={[
                    styles.bellBadge,
                    { backgroundColor: isDark ? '#66D06F' : '#0F4539' },
                  ]}
                >
                  <Text
                    style={[
                      styles.bellBadgeText,
                      { color: isDark ? '#0F1115' : '#FFFFFF' },
                    ]}
                  >
                    {unreadNotifications > 9 ? '9+' : String(unreadNotifications)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push('/perfil')}
              accessibilityLabel="Ir a perfil"
            >
              <Image source={{ uri: avatarUri }} style={styles.headerAvatar} />
            </Pressable>
          </View>
        </View>

        <View style={styles.quickGrid}>
          <QuickActionCard
            label="Todos"
            cta="Ver oportunidades"
            selected={activeFilter === 'all'}
            tone="green"
            icon="sparkles-outline"
            isDark={isDark}
            onPress={() => setActiveFilter('all')}
          />
          <QuickActionCard
            label="Falta uno"
            cta="Súmate al equipo"
            selected={activeFilter === 'players'}
            tone="green"
            icon="person-add-outline"
            isDark={isDark}
            onPress={() => setActiveFilter('players')}
          />
          <QuickActionCard
            label="Partido revuelta"
            cta="Entra a jugar"
            selected={activeFilter === 'open'}
            tone="orange"
            icon="shuffle-outline"
            isDark={isDark}
            onPress={() => setActiveFilter('open')}
          />
          <QuickActionCard
            label="Selección de equipos"
            cta="Elige A o B"
            selected={activeFilter !== 'all' && isTeamPickType(activeFilter)}
            tone="blue"
            icon="git-compare-outline"
            isDark={isDark}
            onPress={() => setActiveFilter('team_pick_public')}
          />
        </View>

        <View
          style={[
            styles.privateCard,
            { borderColor: ui.cardBorder, backgroundColor: ui.card },
          ]}
        >
          <Text style={[styles.privateTitle, { color: ui.text }]}>
            ¿Tienes un código privado?
          </Text>
          <Text style={[styles.privateDesc, { color: ui.textMuted }]}>
            Ingresa los 4 dígitos que te compartió el organizador.
          </Text>
          <Pressable
            onPress={() => privateCodeInputRef.current?.focus()}
            style={styles.codeRow}
          >
            {[0, 1, 2, 3].map((idx) => {
              const digit = teamPrivateCode[idx] ?? '0'
              return (
                <View
                  key={idx}
                  style={[
                    styles.codeBox,
                    {
                      borderColor: ui.cardBorder,
                      backgroundColor: ui.inputBg,
                    },
                  ]}
                >
                  <Text style={[styles.codeDigit, { color: ui.textMuted }]}>
                    {digit}
                  </Text>
                </View>
              )
            })}
          </Pressable>
          <TextInput
            ref={privateCodeInputRef}
            style={styles.hiddenInput}
            value={teamPrivateCode}
            onChangeText={(t) => setTeamPrivateCode(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            autoFocus={false}
          />
          <Pressable style={styles.privateBtn} onPress={onSearchPrivateCode}>
            <Text style={styles.privateBtnText}>Buscar partido</Text>
          </Pressable>
        </View>

        <View style={styles.feedHeader}>
          <Text style={[styles.feedTitle, { color: ui.text }]}>Oportunidades cerca</Text>
        </View>

        <Pressable
          style={[
            styles.cityRow,
            { borderColor: ui.cardBorder, backgroundColor: ui.card },
          ]}
          onPress={() => {
            if (cityOptions.length === 0) return
            Alert.alert(
              'Ciudad',
              undefined,
              [
                {
                  text: 'Todas las ciudades',
                  onPress: () => setSelectedCity(null),
                },
                ...cityOptions.map((c) => ({
                  text: c,
                  onPress: () => setSelectedCity(c),
                })),
                { text: 'Cancelar', style: 'cancel' },
              ],
              { cancelable: true }
            )
          }}
        >
          <Ionicons name="location-outline" size={18} color={ui.textMuted} />
          <Text style={[styles.cityRowText, { color: ui.text }]}>
            {selectedCity ?? 'Todas las ciudades'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={ui.textMuted} />
        </Pressable>

        {listMatches.length > 0 ? (
          <View style={styles.cards}>
            {listMatches.map((match) => (
              <HomeMatchCard
                key={match.id}
                match={match}
                courtCost={courtCostsByMatchId.get(match.id) ?? null}
                isOwn={currentUser?.id === match.creatorId}
                isJoined={participatingOpportunityIds.includes(match.id)}
                joining={joiningId === match.id}
                onViewDetails={() =>
                  router.push(`/partidos/${match.id}`)
                }
                currentUserId={currentUser?.id}
                onShareRevuelta={() => shareRevuelta(match)}
                onJoin={() =>
                  void handleJoin(
                    match.id,
                    currentUser?.id === match.creatorId,
                    match.type
                  )
                }
              />
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.empty,
              {
                backgroundColor: ui.emptyBg,
                borderColor: ui.cardBorder,
              },
            ]}
          >
            <Ionicons name="football-outline" size={40} color="#0F4539" />
            <Text style={[styles.emptyText, { color: ui.text }]}>
              No hay partidos disponibles con este filtro
            </Text>
            <Pressable
              onPress={() => {
                setActiveFilter('all')
                setSelectedCity(null)
              }}
            >
              <Text style={[styles.emptyLink, { color: ui.sectionLink }]}>
                Ver todos los partidos
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <JoinRevueltaModal
        visible={revueltaJoinOpp !== null}
        onClose={() => setRevueltaJoinOpp(null)}
        opportunity={revueltaJoinOpp}
        onJoin={async (isGk) => {
          if (!revueltaJoinOpp) return false
          const match = revueltaJoinOpp
          const r = await joinMatchOpportunity(match.id, {
            isGoalkeeper: isGk,
          })
          if (r.ok) showJoinSuccess(match, isGk)
          else alertJoinResult(r)
          return r.ok
        }}
      />

      <JoinTeamPickModal
        visible={teamPickJoinOpp !== null}
        onClose={() => {
          setTeamPickJoinOpp(null)
          setTeamPickInitialCode('')
        }}
        opportunity={teamPickJoinOpp}
        initialJoinCode={teamPickInitialCode}
        onJoin={async ({ team, role, joinCode }) => {
          if (!teamPickJoinOpp) return false
          const match = teamPickJoinOpp
          const r = await joinMatchOpportunity(match.id, {
            teamPickTeam: team,
            teamPickRole: role,
            teamPickJoinCode: joinCode,
          })
          if (r.ok) showJoinSuccess(match, role === 'gk')
          else alertJoinResult(r)
          return r.ok
        }}
      />

      <JoinPlayersModal
        visible={playersJoinOpp !== null}
        onClose={() => setPlayersJoinOpp(null)}
        opportunity={playersJoinOpp}
        onJoin={async (isGk) => {
          if (!playersJoinOpp) return false
          const match = playersJoinOpp
          const r = await joinMatchOpportunity(match.id, {
            isGoalkeeper: isGk,
          })
          if (r.ok) showJoinSuccess(match, isGk)
          else alertJoinResult(r)
          return r.ok
        }}
      />

      <MatchJoinSuccessModal
        visible={joinSuccessVisible}
        matchTitle={joinSuccessTitle}
        joinedAsGoalkeeper={joinedAsGoalkeeper}
        onClose={() => setJoinSuccessVisible(false)}
      />

      <RivalTeamPickerModal
        visible={rivalPickOppId !== null}
        captainTeams={captainTeams}
        onClose={() => setRivalPickOppId(null)}
        onPickTeam={(teamId) => {
          const id = rivalPickOppId
          setRivalPickOppId(null)
          if (!id) return
          void (async () => {
            const res = await acceptRivalOpportunityWithTeam(id, teamId)
            if (!res.ok && res.error) {
              Alert.alert('No se pudo desafiar', res.error)
            } else if (res.ok) {
              Alert.alert(
                'Listo',
                'Desafío aceptado. Revisa tus partidos para coordinar.'
              )
            }
          })()
        }}
      />
    </SafeAreaView>
  )
}

function QuickActionCard({
  label,
  cta,
  selected,
  tone,
  icon,
  isDark,
  onPress,
}: {
  label: string
  cta: string
  selected: boolean
  tone: 'green' | 'orange' | 'blue'
  icon: keyof typeof Ionicons.glyphMap
  isDark: boolean
  onPress: () => void
}) {
  const accent =
    tone === 'orange' ? '#f59e0b' : tone === 'blue' ? '#0ea5e9' : '#0F4539'
  const bg = isDark ? '#141717' : '#EEF3EC'
  const border = isDark ? '#2C3131' : '#D2DBCE'
  const ctaColor = isDark ? '#9CA3A3' : '#4E6A4D'
  const selectedBg =
    tone === 'orange'
      ? isDark
        ? 'rgba(245, 158, 11, 0.12)'
        : 'rgba(245, 158, 11, 0.16)'
      : tone === 'blue'
        ? isDark
          ? 'rgba(14, 165, 233, 0.12)'
          : 'rgba(14, 165, 233, 0.14)'
        : isDark
          ? 'rgba(15, 69, 57, 0.12)'
          : 'rgba(15, 69, 57, 0.16)'
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.quickCard,
        { borderColor: border, backgroundColor: bg },
        selected && { borderColor: accent, backgroundColor: selectedBg },
      ]}
    >
      <Ionicons name={icon} size={22} color={accent} />
      <Text style={[styles.quickLabel, { color: accent }]}>{label}</Text>
      <Text style={[styles.quickCta, { color: ctaColor }]}>{cta}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090B0A' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 28 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C3131',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#141717',
    borderWidth: 1,
    borderColor: '#2C3131',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogo: {
    width: 36,
    height: 36,
  },
  h1: { fontSize: 20, fontWeight: '800', color: '#F5F7F7' },
  sub: { fontSize: 13, color: '#9CA3A3', marginTop: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#0F4539',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 14,
    gap: 10,
  },
  quickCard: {
    width: '47%',
    flexGrow: 1,
    minWidth: '45%',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2C3131',
    backgroundColor: '#141717',
    gap: 8,
  },
  quickCardIdle: {},
  quickCardOn: {},
  quickLabel: { fontSize: 14, fontWeight: '700', color: '#F5F7F7' },
  quickCta: { fontSize: 11, color: '#9CA3A3', lineHeight: 15 },
  privateCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2C3131',
    backgroundColor: '#141717',
  },
  privateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F5F7F7',
    marginBottom: 8,
  },
  privateDesc: {
    fontSize: 12,
    color: '#9CA3A3',
    lineHeight: 18,
    marginBottom: 14,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  codeBox: {
    flex: 1,
    minHeight: 62,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDigit: { fontSize: 36, fontWeight: '700' },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  privateInput: {
    borderWidth: 1,
    borderColor: '#2C3131',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    color: '#F5F7F7',
    backgroundColor: '#090B0A',
    marginBottom: 12,
  },
  privateBtn: {
    backgroundColor: '#0F4539',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  privateBtnText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#F5F7F7' },
  bannerSub: { fontSize: 13, color: '#9CA3A3', marginTop: 2 },
  feedHeader: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  feedTitle: { fontSize: 17, fontWeight: '800', color: '#F5F7F7' },
  cityRow: {
    marginHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C3131',
    backgroundColor: '#141717',
  },
  cityRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#F5F7F7' },
  cards: { paddingHorizontal: 16, gap: 14 },
  empty: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyText: { fontSize: 15, color: '#9CA3A3', textAlign: 'center' },
  emptyLink: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    color: '#86efac',
  },
})
