import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  Alert,
  Linking,
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
import { alertJoinResult } from '../lib/alert-join-result'
import { matchInviteSharePayload } from '../lib/match-invite-share'
import { startOfToday } from '../lib/format-match'
import { useApp } from '../lib/app-provider'
import { useScreenTheme } from '../lib/theme-ui'
import { useMatchCourtCosts } from '../lib/use-match-court-costs'
import type { Level, MatchOpportunity, MatchType, SportsVenue } from '../lib/types'
import { usePublicVenues } from '../src/features/explore/hooks/use-public-venues'

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

export function ExploreScreen() {
  const {
    currentUser,
    getFilteredMatches,
    getUserTeams,
    joinMatchOpportunity,
    acceptRivalOpportunityWithTeam,
    participatingOpportunityIds,
  } = useApp()

  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [revueltaJoinOpp, setRevueltaJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [teamPickJoinOpp, setTeamPickJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [playersJoinOpp, setPlayersJoinOpp] = useState<MatchOpportunity | null>(
    null
  )
  const [rivalPickOppId, setRivalPickOppId] = useState<string | null>(null)
  const [joinSuccessVisible, setJoinSuccessVisible] = useState(false)
  const [joinSuccessTitle, setJoinSuccessTitle] = useState<string | undefined>()
  const [joinedAsGoalkeeper, setJoinedAsGoalkeeper] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<{
    types: MatchType[]
    levels: Level[]
  }>({ types: [], levels: [] })
  const theme = useScreenTheme()
  const styles = useMemo(() => createExploreStyles(theme), [theme])
  const { data: publicVenues = [] } = usePublicVenues()

  const midnight = useMemo(() => startOfToday(), [])
  const userCityNormalized = normalizeLocation(currentUser?.city)

  const allMatches = useMemo(() => {
    if (!currentUser) return []
    return getFilteredMatches(currentUser.gender).filter(
      (m) =>
        (m.status === 'pending' || m.status === 'confirmed') &&
        (userCityNormalized === '' ||
          normalizeLocation(m.location) === userCityNormalized)
    )
  }, [currentUser, getFilteredMatches, userCityNormalized])

  const visibleVenues = useMemo(() => {
    if (!currentUser) return []
    if (userCityNormalized === '') return publicVenues
    return publicVenues.filter(
      (v) => normalizeLocation(v.city) === userCityNormalized
    )
  }, [currentUser, publicVenues, userCityNormalized])

  const visibleMatches = useMemo(
    () => allMatches.filter((m) => m.dateTime.getTime() >= midnight.getTime()),
    [allMatches, midnight]
  )

  const filteredMatches = useMemo(() => {
    return visibleMatches.filter((match) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const ok =
          match.title.toLowerCase().includes(q) ||
          match.venue.toLowerCase().includes(q) ||
          match.teamName?.toLowerCase().includes(q) ||
          match.location.toLowerCase().includes(q)
        if (!ok) return false
      }
      if (filters.types.length > 0 && !filters.types.includes(match.type)) {
        return false
      }
      if (filters.levels.length > 0 && !filters.levels.includes(match.level)) {
        return false
      }
      return true
    })
  }, [visibleMatches, searchQuery, filters])

  const courtCostsByMatchId = useMatchCourtCosts(filteredMatches)

  const toggleType = (type: MatchType) => {
    setFilters((f) =>
      f.types.includes(type)
        ? { ...f, types: f.types.filter((t) => t !== type) }
        : { ...f, types: [...f.types, type] }
    )
  }

  const toggleLevel = (level: Level) => {
    setFilters((f) =>
      f.levels.includes(level)
        ? { ...f, levels: f.levels.filter((l) => l !== level) }
        : { ...f, levels: [...f.levels, level] }
    )
  }

  const clearFilters = () => {
    setFilters({ types: [], levels: [] })
    setSearchQuery('')
  }

  const activeFilterCount = filters.types.length + filters.levels.length

  const captainTeams = useMemo(() => {
    if (!currentUser) return []
    return getUserTeams().filter((t) => t.captainId === currentUser.id)
  }, [currentUser, getUserTeams])

  const cityHint = currentUser?.city?.trim() || 'Rancagua'

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
            'Desafío aceptado. Revisa Partidos para coordinar.'
          )
        }
      } else {
        setRivalPickOppId(opportunityId)
      }
      return
    }

    if (type === 'open') {
      const m = filteredMatches.find((x) => x.id === opportunityId)
      if (m) setRevueltaJoinOpp(m)
      return
    }

    if (isTeamPickType(type)) {
      const m = filteredMatches.find((x) => x.id === opportunityId)
      if (m) setTeamPickJoinOpp(m)
      return
    }

    if (type === 'players') {
      const m = filteredMatches.find((x) => x.id === opportunityId)
      if (m) setPlayersJoinOpp(m)
      return
    }

    setJoiningId(opportunityId)
    try {
      const r = await joinMatchOpportunity(opportunityId)
      if (r.ok) {
        const m = filteredMatches.find((x) => x.id === opportunityId)
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

  const openVenue = (v: SportsVenue) => {
    const lines = [v.address, v.city, v.phone].filter(Boolean).join('\n')
    const buttons: {
      text: string
      style?: 'cancel' | 'default'
      onPress?: () => void
    }[] = [
      {
        text: 'Página del centro',
        onPress: () => {
          router.push(`/centro/${v.id}`)
        },
      },
    ]
    if (v.mapsUrl) {
      buttons.push({
        text: 'Abrir mapa',
        onPress: () => {
          void Linking.openURL(v.mapsUrl!)
        },
      })
    }
    buttons.push({ text: 'Cerrar', style: 'cancel' })
    Alert.alert(v.name, lines || 'Sin detalles adicionales.', buttons)
  }

  if (!currentUser || currentUser.accountType !== 'player') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.gate}>
          <Text style={styles.gateText}>
            Explorar está disponible para cuentas jugador.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.h1}>Explorar</Text>

          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar partidos, canchas..."
                placeholderTextColor={theme.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  hitSlop={8}
                  style={styles.clearSearch}
                >
                  <Text style={styles.clearSearchText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              style={[styles.filterBtn, showFilters && styles.filterBtnOn]}
              onPress={() => setShowFilters((s) => !s)}
            >
              <Text style={styles.filterBtnIcon}>⚙</Text>
              {activeFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>
                    {activeFilterCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {showFilters ? (
            <View style={styles.filtersPanel}>
              <Text style={styles.filterSectionLabel}>
                Tipo de partido
              </Text>
              <View style={styles.chipRow}>
                <FilterChip
                  icon="🎯"
                  label="Rivales"
                  active={filters.types.includes('rival')}
                  theme={theme}
                  styles={styles}
                  onPress={() => toggleType('rival')}
                />
                <FilterChip
                  icon="👥"
                  label="Jugadores"
                  active={filters.types.includes('players')}
                  theme={theme}
                  styles={styles}
                  onPress={() => toggleType('players')}
                />
                <FilterChip
                  icon="🔀"
                  label="Revueltas"
                  active={filters.types.includes('open')}
                  theme={theme}
                  styles={styles}
                  onPress={() => toggleType('open')}
                />
              </View>

              <Text style={styles.filterSectionLabel}>Nivel</Text>
              <View style={styles.chipRow}>
                {(
                  [
                    'principiante',
                    'intermedio',
                    'avanzado',
                    'competitivo',
                  ] as const
                ).map((lvl) => (
                  <FilterChip
                    key={lvl}
                    icon="⭐"
                    label={
                      lvl === 'principiante'
                        ? 'Principiante'
                        : lvl === 'intermedio'
                          ? 'Intermedio'
                          : lvl === 'avanzado'
                            ? 'Avanzado'
                            : 'Competitivo'
                    }
                    active={filters.levels.includes(lvl)}
                    theme={theme}
                    styles={styles}
                    onPress={() => toggleLevel(lvl)}
                  />
                ))}
              </View>

              {activeFilterCount > 0 ? (
                <Pressable onPress={clearFilters} style={styles.clearFiltersBtn}>
                  <Text style={styles.clearFiltersText}>
                    Limpiar filtros
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {visibleVenues.length > 0 ? (
          <View style={styles.venuesSection}>
            <Text style={styles.venuesTitle}>
              🏢 Centros deportivos
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.venuesScroll}
            >
              {visibleVenues.map((v) => (
                <Pressable
                  key={v.id}
                  style={styles.venueCard}
                  onPress={() => openVenue(v)}
                >
                  <Text style={styles.venueName} numberOfLines={2}>
                    {v.name}
                  </Text>
                  <Text style={styles.venueCity}>📍 {v.city}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.results}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultCount}>
              {filteredMatches.length}{' '}
              {filteredMatches.length === 1 ? 'resultado' : 'resultados'}
            </Text>
            {searchQuery.length > 0 ? (
              <Text style={styles.cityHint}>📍 {cityHint}</Text>
            ) : null}
          </View>

          {filteredMatches.length > 0 ? (
            <View style={styles.cards}>
              {filteredMatches.map((match) => (
                <HomeMatchCard
                  key={match.id}
                  match={match}
                  courtCost={courtCostsByMatchId.get(match.id) ?? null}
                  isOwn={currentUser.id === match.creatorId}
                  isJoined={participatingOpportunityIds.includes(match.id)}
                  joining={joiningId === match.id}
                  onViewDetails={() => router.push(`/partidos/${match.id}`)}
                  currentUserId={currentUser.id}
                  onShareRevuelta={() => {
                    const joined = match.playersJoined ?? 0
                    const slotsLeft =
                      match.playersNeeded != null
                        ? Math.max(0, match.playersNeeded - joined)
                        : undefined
                    const { message, url, title } = matchInviteSharePayload(match, {
                      slotsLeft,
                    })
                    void Share.share({ message, url, title })
                  }}
                  onJoin={() =>
                    void handleJoin(
                      match.id,
                      currentUser.id === match.creatorId,
                      match.type
                    )
                  }
                />
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>
                No encontramos partidos con estos filtros
              </Text>
              <Pressable onPress={clearFilters}>
                <Text style={styles.emptyLink}>
                  Limpiar filtros
                </Text>
              </Pressable>
            </View>
          )}
        </View>
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
        onClose={() => setTeamPickJoinOpp(null)}
        opportunity={teamPickJoinOpp}
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
                'Desafío aceptado. Revisa Partidos para coordinar.'
              )
            }
          })()
        }}
      />
    </SafeAreaView>
  )
}

function FilterChip({
  icon,
  label,
  active,
  theme,
  styles: s,
  onPress,
}: {
  icon: string
  label: string
  active: boolean
  theme: ReturnType<typeof useScreenTheme>
  styles: ReturnType<typeof createExploreStyles>
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.chip,
        {
          backgroundColor: active ? theme.primary : theme.chipBg,
          borderColor: active ? theme.primary : theme.chipBorder,
        },
      ]}
    >
      <Text style={s.chipIcon}>{icon}</Text>
      <Text
        style={[
          s.chipLabel,
          { color: active ? theme.primaryBtnText : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function createExploreStyles(theme: ReturnType<typeof useScreenTheme>) {
  const filterBtnOnBg = theme.isDark
    ? theme.selectedTint
    : 'rgba(37, 99, 235, 0.1)'
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    scroll: { flex: 1, backgroundColor: theme.bg },
    scrollContent: { paddingBottom: 32 },
    header: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    h1: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 14,
    },
    searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    searchWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.chipBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      minHeight: 48,
    },
    searchIcon: { fontSize: 16, marginRight: 8 },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: theme.text,
      paddingVertical: 10,
    },
    clearSearch: { padding: 4 },
    clearSearchText: { fontSize: 16, color: theme.textMuted },
    filterBtn: {
      position: 'relative',
      width: 48,
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBtnOn: {
      backgroundColor: filterBtnOnBg,
      borderColor: theme.primary,
    },
    filterBtnIcon: { fontSize: 20 },
    filterBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterBadgeText: {
      color: theme.primaryBtnText,
      fontSize: 11,
      fontWeight: '700',
    },
    filtersPanel: { marginTop: 16, gap: 12 },
    filterSectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },
    chipIcon: { fontSize: 14 },
    chipLabel: { fontSize: 14 },
    clearFiltersBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
    clearFiltersText: { fontSize: 14, color: theme.textMuted },
    venuesSection: {
      paddingTop: 12,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    venuesTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    venuesScroll: { paddingHorizontal: 12, gap: 10, paddingBottom: 8 },
    venueCard: {
      width: 200,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      marginHorizontal: 4,
    },
    venueName: { fontSize: 14, fontWeight: '600', color: theme.text },
    venueCity: { fontSize: 12, color: theme.textMuted, marginTop: 6 },
    results: { padding: 16 },
    resultsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    resultCount: { fontSize: 14, color: theme.textMuted },
    cityHint: { fontSize: 14, color: theme.textMuted },
    cards: { gap: 14 },
    empty: { alignItems: 'center', paddingVertical: 48 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: {
      fontSize: 15,
      color: theme.textMuted,
      textAlign: 'center',
    },
    emptyLink: {
      marginTop: 12,
      fontSize: 15,
      fontWeight: '600',
      color: theme.link,
    },
    gate: { flex: 1, justifyContent: 'center', padding: 24 },
    gateText: {
      fontSize: 15,
      color: theme.textMuted,
      textAlign: 'center',
    },
  })
}
