import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState, Fragment, type ComponentProps } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  formatMatchDateTime,
  levelLabel,
  matchTypeLabel,
  startOfToday,
} from '../lib/format-match'
import { playersJoinRules, playersSeekProfileLabel } from '../lib/players-seek-profile'
import { useApp } from '../lib/app-provider'
import { useThemePreference } from '../lib/theme-context'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import {
  fetchParticipantsForOpportunity,
  type OpportunityParticipantRow,
} from '../lib/supabase/message-queries'
import {
  fetchMatchDetailRatingsBundle,
  fetchRatingSummaryForOpportunity,
  type MatchOpportunityRatingRow,
  type RatingSummary,
} from '../lib/supabase/rating-queries'
import { MatchCompletionPanel } from './match-completion-panel'
import { MatchPitchLineup } from './match-pitch-lineup'
import { PublicPlayerProfileModal } from './public-player-profile-modal'
import { RivalMatchEncounter } from './rival-match-encounter'
import {
  fetchRivalEncounterDetail,
  fetchRivalParticipantTeamIds,
  type RivalEncounterDetail,
} from '../lib/supabase/rival-match-detail'
import {
  buildMatchLineupLayout,
  buildRivalMatchLineupLayout,
  slotRoleToTeamPickRole,
  usesPitchLineup,
} from '../lib/match-lineup-slots'
import { DEFAULT_AVATAR } from '../lib/supabase/mappers'
import {
  countRivalTeamParticipants,
  isLineupSlotTaken,
  participantOwnsLineupSlot,
  resolveUserRivalPickTeam,
  type RivalSlotPick,
} from '../lib/rival-lineup-slot'

function isUserInvolved(
  userId: string,
  creatorId: string,
  oppId: string,
  participatingIds: string[]
) {
  return creatorId === userId || participatingIds.includes(oppId)
}

function isTeamPickType(type: string): boolean {
  return (
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

function statusLabel(status: string): string {
  if (status === 'confirmed') return 'Confirmado'
  if (status === 'completed') return 'Finalizado'
  if (status === 'cancelled') return 'Cancelado'
  return 'Abierto'
}

function statusTone(
  status: string,
  tokens: {
    primaryGreen: string
    muted: string
    textMuted: string
    accentGold: string
    danger: string
  }
): { bg: string; text: string } {
  if (status === 'confirmed') {
    return {
      bg: tokens.primaryGreen + '22',
      text: tokens.primaryGreen,
    }
  }
  if (status === 'completed') {
    return { bg: tokens.muted + '33', text: tokens.textMuted }
  }
  if (status === 'cancelled') {
    return { bg: tokens.danger + '18', text: tokens.danger }
  }
  return { bg: tokens.accentGold + '22', text: tokens.accentGold }
}

export function MatchDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[]
    joinCode?: string | string[]
  }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const joinCodeParam = Array.isArray(params.joinCode)
    ? params.joinCode[0]
    : params.joinCode
  const {
    currentUser,
    matchOpportunities,
    participatingOpportunityIds,
    refreshMatchData,
    joinMatchOpportunity,
    leaveRivalMatchOpportunity,
    teams,
    getUserTeams,
    finalizeMatchOpportunity,
    suspendMatchOpportunity,
    submitMatchRating,
  } = useApp()
  const [busy, setBusy] = useState(false)
  const [wantGk, setWantGk] = useState(false)
  const [teamPickTeam, setTeamPickTeam] = useState<'A' | 'B'>('A')
  const [teamPickRole, setTeamPickRole] = useState<
    'gk' | 'defensa' | 'mediocampista' | 'delantero'
  >('defensa')
  const [teamPickJoinCode, setTeamPickJoinCode] = useState(joinCodeParam ?? '')
  const [loadingOpp, setLoadingOpp] = useState(false)
  const [participants, setParticipants] = useState<OpportunityParticipantRow[]>(
    []
  )
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [myRating, setMyRating] = useState<MatchOpportunityRatingRow | null>(null)
  const [loadingRating, setLoadingRating] = useState(false)
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null)
  const [recentComments, setRecentComments] = useState<
    Array<{ comment: string; createdAt: Date }>
  >([])
  const [highlightTeam, setHighlightTeam] = useState<'A' | 'B' | null>(null)
  const [rivalEncounter, setRivalEncounter] = useState<RivalEncounterDetail | null>(
    null
  )
  const [rivalSideByUser, setRivalSideByUser] = useState<
    Map<string, 'home' | 'away'>
  >(new Map())
  const [loadingRivalMeta, setLoadingRivalMeta] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const { resolved, tokens } = useThemePreference()
  const isDark = resolved === 'dark'

  const opp = useMemo(
    () => matchOpportunities.find((m) => m.id === id),
    [matchOpportunities, id]
  )

  useEffect(() => {
    if (!id || opp || !currentUser) return
    let cancelled = false
    void (async () => {
      setLoadingOpp(true)
      try {
        await refreshMatchData()
      } finally {
        if (!cancelled) setLoadingOpp(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [opp, id, currentUser, refreshMatchData])

  const loadParticipants = useCallback(async () => {
    if (!id || !currentUser || !isSupabaseConfigured()) {
      setParticipants([])
      return
    }
    setLoadingParticipants(true)
    try {
      const rows = await fetchParticipantsForOpportunity(getSupabase(), id)
      setParticipants(rows)
    } finally {
      setLoadingParticipants(false)
    }
  }, [id, currentUser])

  const loadRatingsOverview = useCallback(async () => {
    if (!id || !isSupabaseConfigured()) {
      setRatingSummary(null)
      setRecentComments([])
      setMyRating(null)
      return
    }
    setLoadingRating(true)
    try {
      const supabase = getSupabase()
      const [bundle, summary] = await Promise.all([
        fetchMatchDetailRatingsBundle(supabase, id),
        fetchRatingSummaryForOpportunity(supabase, id),
      ])
      setMyRating(bundle.myRating)
      setRatingSummary(summary)
      setRecentComments(
        bundle.comments.map((c) => ({
          comment: c.comment,
          createdAt: new Date(c.created_at),
        }))
      )
    } finally {
      setLoadingRating(false)
    }
  }, [id])

  useEffect(() => {
    void loadParticipants()
    void loadRatingsOverview()
  }, [loadParticipants, loadRatingsOverview])

  const loadRivalEncounter = useCallback(async () => {
    if (!id || !opp || opp.type !== 'rival' || !isSupabaseConfigured()) {
      setRivalEncounter(null)
      setRivalSideByUser(new Map())
      return
    }
    setLoadingRivalMeta(true)
    try {
      const supabase = getSupabase()
      const detail = await fetchRivalEncounterDetail(
        supabase,
        id,
        opp.title,
        opp.playersNeeded
      )
      setRivalEncounter(detail)
      const sideMap = await fetchRivalParticipantTeamIds(
        supabase,
        detail.home.teamId,
        detail.away?.teamId ?? null
      )
      setRivalSideByUser(sideMap)
    } finally {
      setLoadingRivalMeta(false)
    }
  }, [id, opp])

  useEffect(() => {
    void loadRivalEncounter()
  }, [loadRivalEncounter])

  const midnight = useMemo(() => startOfToday(), [])

  const involved = useMemo(() => {
    if (!currentUser || !opp) return false
    return isUserInvolved(
      currentUser.id,
      opp.creatorId,
      opp.id,
      participatingOpportunityIds
    )
  }, [currentUser, opp, participatingOpportunityIds])

  const myTeams = useMemo(() => getUserTeams(), [getUserTeams])

  const userRivalPickTeam = useMemo(() => {
    if (!currentUser || !rivalEncounter || opp?.type !== 'rival') return null
    return resolveUserRivalPickTeam(currentUser.id, rivalEncounter, myTeams)
  }, [currentUser, rivalEncounter, opp?.type, myTeams])

  const rivalEncounterDisplay = useMemo(() => {
    if (!rivalEncounter) return null
    const mergeLogo = (side: { teamId: string; name: string; logoUrl: string }) => {
      const cached = teams.find((t) => t.id === side.teamId)
      if (cached?.logo?.trim()) {
        return { ...side, logoUrl: cached.logo.trim() }
      }
      return side
    }
    return {
      ...rivalEncounter,
      home: mergeLogo(rivalEncounter.home),
      away: rivalEncounter.away ? mergeLogo(rivalEncounter.away) : null,
    }
  }, [rivalEncounter, teams])

  const canJoin = useMemo(() => {
    if (!currentUser || !opp || involved) return false
    if (currentUser.accountType !== 'player') return false
    if (opp.gender !== currentUser.gender) return false
    if (opp.status !== 'pending' && opp.status !== 'confirmed') return false
    if (opp.dateTime.getTime() < midnight.getTime()) return false
    if (opp.type === 'rival') {
      if (!userRivalPickTeam || !rivalEncounter) return false
      const sideMax = rivalEncounter.perSideMax
      const onSide = countRivalTeamParticipants(
        participants,
        userRivalPickTeam,
        rivalSideByUser
      )
      return onSide < sideMax
    }
    return true
  }, [
    currentUser,
    opp,
    involved,
    midnight,
    userRivalPickTeam,
    rivalEncounter,
    participants,
    rivalSideByUser,
  ])

  const isParticipant = participatingOpportunityIds.includes(opp?.id ?? '')

  const topMvp = useMemo(() => {
    const top = ratingSummary?.mvpTally[0]
    if (!top) return null
    const player = participants.find((p) => p.id === top.userId)
    return { name: player?.name ?? 'Jugador', votes: top.votes }
  }, [ratingSummary, participants])

  const canRivalPickSlot = useMemo(() => {
    if (!currentUser || !opp || opp.type !== 'rival') return false
    if (currentUser.accountType !== 'player') return false
    if (opp.gender !== currentUser.gender) return false
    if (opp.status !== 'pending' && opp.status !== 'confirmed') return false
    if (opp.dateTime.getTime() < midnight.getTime()) return false
    if (!userRivalPickTeam || !rivalEncounter) return false
    if (isParticipant) return true
    const sideMax = rivalEncounter.perSideMax
    const onSide = countRivalTeamParticipants(
      participants,
      userRivalPickTeam,
      rivalSideByUser
    )
    return onSide < sideMax
  }, [
    currentUser,
    opp,
    midnight,
    userRivalPickTeam,
    rivalEncounter,
    isParticipant,
    participants,
    rivalSideByUser,
  ])

  const joinRules = opp ? playersJoinRules(opp) : null
  const seekLabel = opp ? playersSeekProfileLabel(opp.playersSeekProfile) : ''
  const isPrivateTeamPick = opp?.type === 'team_pick_private'

  const lineupLayout = useMemo(() => {
    if (!opp || !usesPitchLineup(opp.type)) return null
    return buildMatchLineupLayout(opp, participants)
  }, [opp, participants])

  const rivalLineupLayout = useMemo(() => {
    if (!opp || opp.type !== 'rival' || !rivalEncounterDisplay) return null
    const away = rivalEncounterDisplay.away ?? {
      teamId: 'pending',
      name: rivalEncounterDisplay.awaitingRival ? 'Buscando rival' : 'Por confirmar',
      logoUrl: '',
    }
    return buildRivalMatchLineupLayout(
      rivalEncounterDisplay.home.name,
      away.name,
      rivalEncounterDisplay.home.logoUrl,
      away.logoUrl,
      rivalEncounterDisplay.perSideMax,
      participants,
      rivalSideByUser,
      opp.creatorId
    )
  }, [opp, rivalEncounterDisplay, participants, rivalSideByUser])

  const showPitchLineup = !!lineupLayout && opp?.type !== 'rival'
  const isRivalMatch = opp?.type === 'rival'

  const onRivalSlotPress = async (pick: RivalSlotPick) => {
    if (!opp || !id || !userRivalPickTeam || busy || !canRivalPickSlot) return
    if (pick.pickTeam !== userRivalPickTeam) {
      Alert.alert('Tu equipo', 'Solo puedes ocupar cupos de tu propio equipo.')
      return
    }
    if (
      currentUser &&
      participantOwnsLineupSlot(currentUser.id, pick, participants)
    ) {
      return
    }
    if (isLineupSlotTaken(participants, pick.pickTeam, pick.lineupSlot, rivalSideByUser)) {
      Alert.alert('Cupo ocupado', 'Ese círculo ya fue tomado.')
      return
    }
    const moving = isParticipant
    setBusy(true)
    try {
      const res = await joinMatchOpportunity(id, {
        rivalPickTeam: pick.pickTeam,
        rivalLineupSlot: pick.lineupSlot,
        rivalEncounterRole: pick.role,
      })
      if (res.ok) {
        await refreshMatchData()
        await loadParticipants()
        await loadRivalEncounter()
        Alert.alert('Listo', moving ? 'Cambiaste de cupo.' : 'Te anotaste en el cupo que elegiste.')
        return
      }
      if ('kind' in res && res.kind === 'info') {
        Alert.alert(res.message)
        return
      }
      Alert.alert('No se pudo unir', 'error' in res ? res.error : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const onLeaveRival = () => {
    if (!id || !opp || busy) return
    Alert.alert(
      'No puedo asistir',
      '¿Salir de la plantilla de este encuentro? Liberarás tu cupo para otro compañero.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true)
              try {
                const res = await leaveRivalMatchOpportunity(id)
                if (res.ok) {
                  await refreshMatchData()
                  await loadParticipants()
                  await loadRivalEncounter()
                  Alert.alert('Listo', 'Ya no estás en la plantilla de este partido.')
                  return
                }
                Alert.alert('No se pudo salir', res.error ?? 'Error desconocido')
              } finally {
                setBusy(false)
              }
            })()
          },
        },
      ]
    )
  }

  const onJoin = async () => {
    if (!opp || !id) return
    let asGk: boolean | undefined
    if (opp.type === 'open' || isTeamPickType(opp.type)) {
      asGk = wantGk
    } else if (opp.type === 'players' && joinRules?.kind === 'gk_only') {
      asGk = true
    } else if (opp.type === 'players' && joinRules?.kind === 'field_only') {
      asGk = false
    } else if (opp.type === 'players' && joinRules?.kind === 'mixed') {
      asGk = wantGk
    }
    setBusy(true)
    try {
      const res = await joinMatchOpportunity(
        id,
        isTeamPickType(opp.type)
          ? {
              teamPickTeam,
              teamPickRole,
              teamPickJoinCode: isPrivateTeamPick
                ? teamPickJoinCode.replace(/\D/g, '').slice(0, 4)
                : undefined,
            }
          : { isGoalkeeper: asGk }
      )
      if (res.ok) {
        await refreshMatchData()
        await loadParticipants()
        Alert.alert('Listo', 'Te uniste al partido.')
        return
      }
      if ('kind' in res && res.kind === 'info') {
        Alert.alert(res.message)
        return
      }
      Alert.alert('No se pudo unir', 'error' in res ? res.error : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  if (!currentUser || currentUser.accountType !== 'player') {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bgDark }]}>
        <Text style={[styles.mutedLeft, { color: tokens.textMuted }]}>Solo jugadores.</Text>
      </View>
    )
  }

  if (!opp) {
    if (loadingOpp) {
      return (
        <View style={[styles.center, { backgroundColor: tokens.bgDark }]}>
          <ActivityIndicator size="large" color={tokens.primaryGreen} />
        </View>
      )
    }
    return (
      <View style={[styles.center, { backgroundColor: tokens.bgDark }]}>
        <Text style={[styles.mutedLeft, { color: tokens.textMuted }]}>
          No encontramos este partido.
        </Text>
        <Pressable style={styles.btnGhost} onPress={() => void refreshMatchData()}>
          <Text style={[styles.btnGhostText, { color: tokens.primaryGreen }]}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  const showGkToggle =
    canJoin &&
    (opp.type === 'open' ||
      (opp.type === 'players' && joinRules?.kind === 'mixed'))

  const joinedCount = opp.playersJoined ?? participants.length
  const neededCount = opp.playersNeeded ?? 12
  const fillPct =
    neededCount > 0 ? Math.min(100, Math.round((joinedCount / neededCount) * 100)) : 0
  const statusColors = statusTone(opp.status, tokens)

  const openPlayerProfile = useCallback((userId: string) => {
    setProfileUserId(userId)
  }, [])

  return (
    <Fragment>
    <ScrollView
      style={[styles.scroll, { backgroundColor: tokens.bgDark }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColors.text }]} />
            <Text style={[styles.statusPillText, { color: statusColors.text }]}>
              {statusLabel(opp.status)}
            </Text>
          </View>
          <View style={[styles.typePill, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
            <Ionicons name="football-outline" size={14} color={tokens.primaryGreen} />
            <Text style={[styles.typePillText, { color: tokens.textPrimary }]}>
              {matchTypeLabel(opp.type)}
            </Text>
          </View>
        </View>

        {!isRivalMatch ? (
          <Text style={[styles.title, { color: tokens.textPrimary }]}>{opp.title}</Text>
        ) : null}

        {!isRivalMatch ? (
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
            <Text style={[styles.chipText, { color: tokens.textMuted }]}>
              {levelLabel(opp.level)}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
            <Text style={[styles.chipText, { color: tokens.textMuted }]}>
              {opp.gender === 'male' ? 'Hombres' : 'Mujeres'}
            </Text>
          </View>
          {seekLabel ? (
            <View style={[styles.chip, styles.chipAccent, { backgroundColor: tokens.primaryGreen + '18', borderColor: tokens.primaryGreen + '44' }]}>
              <Text style={[styles.chipText, { color: tokens.primaryGreen }]}>{seekLabel}</Text>
            </View>
          ) : null}
        </View>
        ) : null}
      </View>

      {isRivalMatch && rivalEncounterDisplay ? (
        <RivalMatchEncounter
          encounter={rivalEncounterDisplay}
          level={opp.level}
          status={opp.status}
          venue={opp.venue}
          location={opp.location}
          dateTime={opp.dateTime}
          joinedCount={joinedCount}
          isDark={isDark}
          tokens={tokens}
        />
      ) : null}

      {isRivalMatch && loadingRivalMeta && !rivalEncounter ? (
        <ActivityIndicator color={tokens.primaryGreen} />
      ) : null}

      {/* Info card */}
      {!isRivalMatch ? (
      <View style={[styles.sectionCard, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
        <InfoRow icon="calendar-outline" label="Fecha y hora" value={formatMatchDateTime(opp.dateTime)} tokens={tokens} />
        <View style={[styles.divider, { backgroundColor: tokens.borderDark }]} />
        <InfoRow icon="location-outline" label="Lugar" value={`${opp.venue} · ${opp.location}`} tokens={tokens} />
        {opp.description ? (
          <>
            <View style={[styles.divider, { backgroundColor: tokens.borderDark }]} />
            <Text style={[styles.descLabel, { color: tokens.textMuted }]}>Descripción</Text>
            <Text style={[styles.desc, { color: tokens.textPrimary }]}>{opp.description}</Text>
          </>
        ) : null}
      </View>
      ) : opp.description ? (
        <View style={[styles.sectionCard, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
          <Text style={[styles.descLabel, { color: tokens.textMuted }]}>Descripción</Text>
          <Text style={[styles.desc, { color: tokens.textPrimary }]}>{opp.description}</Text>
        </View>
      ) : null}

      {/* Roster progress */}
      {opp.playersNeeded != null && !isRivalMatch ? (
        <View style={[styles.sectionCard, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
          <View style={styles.progressHeader}>
            <View style={styles.progressTitleRow}>
              <Ionicons name="people-outline" size={18} color={tokens.primaryGreen} />
              <Text style={[styles.cardTitle, { color: tokens.textPrimary }]}>Cupos del partido</Text>
            </View>
            <Text style={[styles.progressCount, { color: tokens.primaryGreen }]}>
              {joinedCount}/{neededCount}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5EBE4' }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${fillPct}%`, backgroundColor: tokens.primaryGreen },
              ]}
            />
          </View>
          <Text style={[styles.progressHint, { color: tokens.textMuted }]}>
            {fillPct >= 100 ? 'Cupos completos' : `${neededCount - joinedCount} cupos disponibles`}
          </Text>
        </View>
      ) : null}

      {/* Organizador */}
      <View style={[styles.sectionCard, styles.orgCard, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
        <Image source={{ uri: opp.creatorPhoto }} style={styles.avatar} />
        <View style={styles.orgBody}>
          <Text style={[styles.orgLabel, { color: tokens.textMuted }]}>Organizador</Text>
          <Text style={[styles.orgName, { color: tokens.textPrimary }]}>{opp.creatorName}</Text>
        </View>
        {involved ? (
          <View style={[styles.inBadge, { backgroundColor: tokens.primaryGreen + '22' }]}>
            <Ionicons name="checkmark-circle" size={16} color={tokens.primaryGreen} />
          </View>
        ) : null}
      </View>

      {involved ? (
        <Pressable
          style={[styles.chatBtn, { backgroundColor: tokens.primaryGreen, borderColor: tokens.primaryGreen }]}
          onPress={() => id && router.push(`/partidos/chat/${id}`)}
        >
          <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
          <Text style={styles.chatBtnText}>Abrir chat del partido</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
        </Pressable>
      ) : null}

      {isRivalMatch &&
      isParticipant &&
      (opp.status === 'pending' || opp.status === 'confirmed') &&
      opp.dateTime.getTime() >= midnight.getTime() ? (
        <Pressable
          style={[
            styles.leaveRivalBtn,
            { borderColor: tokens.danger, backgroundColor: tokens.danger + '12' },
            busy && styles.primaryBtnDisabled,
          ]}
          onPress={onLeaveRival}
          disabled={busy}
        >
          <Ionicons name="exit-outline" size={20} color={tokens.danger} />
          <Text style={[styles.leaveRivalBtnText, { color: tokens.danger }]}>No puedo asistir</Text>
        </Pressable>
      ) : null}

      {/* Plantilla / participantes */}
      <View style={[styles.sectionCard, styles.lineupCard, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
        <View style={styles.sectionHead}>
          <View style={styles.progressTitleRow}>
            <Ionicons name="grid-outline" size={18} color={tokens.accentGold} />
            <Text style={[styles.cardTitle, { color: tokens.textPrimary }]}>
              {showPitchLineup
                ? 'Plantilla del partido'
                : isRivalMatch
                  ? 'Plantilla en cancha'
                  : 'Participantes'}
            </Text>
          </View>
          {showPitchLineup ? (
            <Text style={[styles.sectionSub, { color: tokens.textMuted }]}>Formación 1-2-2-1</Text>
          ) : rivalLineupLayout?.formationLabel ? (
            <Text style={[styles.sectionSub, { color: tokens.textMuted }]}>
              Formación {rivalLineupLayout.formationLabel}
            </Text>
          ) : null}
        </View>

        {isRivalMatch && rivalLineupLayout ? (
          <>
            <MatchPitchLineup
              layout={rivalLineupLayout}
              loading={loadingParticipants || loadingRivalMeta}
              canJoin={canRivalPickSlot}
              currentUserId={currentUser.id}
              isDark={isDark}
              accentGold={tokens.accentGold}
              rivalJoinTeam={userRivalPickTeam}
              onRivalSlotPress={(pick) => void onRivalSlotPress(pick)}
              onPlayerPress={openPlayerProfile}
            />
            <View style={[styles.tipBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0F5EF', marginTop: 10 }]}>
              <Ionicons name="finger-print-outline" size={16} color={tokens.accentGold} />
              <Text style={[styles.lineupJoinHint, { color: tokens.textMuted }]}>
                {canRivalPickSlot
                  ? isParticipant
                    ? 'Toca otro círculo libre de tu equipo para cambiar de cupo (cancha o suplente). Toca un jugador para ver su perfil.'
                    : 'Toca un círculo libre de tu equipo (arriba o abajo) para anotarte en ese cupo.'
                  : userRivalPickTeam
                    ? 'Tu equipo ya no tiene cupos libres en este encuentro. Toca un jugador para ver su perfil.'
                    : 'Toca un jugador en la cancha para ver su perfil. Solo miembros de los equipos del desafío pueden ocupar cupos.'}
              </Text>
            </View>
          </>
        ) : isRivalMatch && (loadingParticipants || loadingRivalMeta) ? (
          <ActivityIndicator color={tokens.primaryGreen} style={{ marginVertical: 16 }} />
        ) : null}

        {showPitchLineup && lineupLayout ? (
          <>
            <MatchPitchLineup
              layout={lineupLayout}
              loading={loadingParticipants}
              canJoin={canJoin}
              currentUserId={currentUser.id}
              highlightTeam={highlightTeam}
              isDark={isDark}
              accentGold={tokens.accentGold}
              onEmptySlotPress={(team, role) => {
                setHighlightTeam(team)
                if (isTeamPickType(opp.type)) {
                  setTeamPickTeam(team)
                  setTeamPickRole(slotRoleToTeamPickRole(role))
                }
              }}
              onPlayerPress={openPlayerProfile}
            />
            {canJoin ? (
              <View style={[styles.tipBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0F5EF' }]}>
                <Ionicons name="finger-print-outline" size={16} color={tokens.accentGold} />
                <Text style={[styles.lineupJoinHint, { color: tokens.textMuted }]}>
                  Toca un cupo libre en la cancha y confirma tu rol abajo. Toca un jugador para ver su perfil.
                </Text>
              </View>
            ) : (
              <View style={[styles.tipBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0F5EF' }]}>
                <Ionicons name="information-circle-outline" size={16} color={tokens.textMuted} />
                <Text style={[styles.lineupJoinHint, { color: tokens.textMuted }]}>
                  Toca un jugador en la cancha para ver su perfil.
                </Text>
              </View>
            )}
          </>
        ) : isRivalMatch ? null : loadingParticipants ? (
          <ActivityIndicator color={tokens.primaryGreen} style={{ marginVertical: 16 }} />
        ) : participants.length > 0 ? (
          participants.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.partRow, { borderBottomColor: tokens.borderDark }]}
              onPress={() => openPlayerProfile(p.id)}
            >
              <Image source={{ uri: p.photo }} style={styles.partAvatar} />
              <Text style={[styles.partName, { color: tokens.textPrimary }]} numberOfLines={1}>
                {p.name}
                {(opp.type === 'open' || opp.type === 'players') && p.isGoalkeeper ? ' 🧤' : ''}
              </Text>
              <Text style={[styles.partBadge, { color: tokens.textMuted }]}>
                {p.status === 'creator' ? 'Org.' : p.status === 'confirmed' ? 'OK' : p.status}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={[styles.mutedLeft, { color: tokens.textMuted }]}>Sin participantes aún.</Text>
        )}
      </View>

      {(opp.status === 'completed' || (ratingSummary?.count ?? 0) > 0) && (
        <View style={[styles.sectionCard, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
          <View style={styles.progressTitleRow}>
            <Ionicons name="star-outline" size={18} color={tokens.accentGold} />
            <Text style={[styles.cardTitle, { color: tokens.textPrimary }]}>Calificaciones</Text>
          </View>
          <View style={styles.statsGrid}>
            {[
              { label: 'Reseñas', value: String(ratingSummary?.count ?? 0) },
              { label: 'General', value: ratingSummary?.avgOverall != null ? `⭐ ${ratingSummary.avgOverall}` : '—' },
              { label: 'Recinto', value: ratingSummary?.avgVenue != null ? `⭐ ${ratingSummary.avgVenue}` : '—' },
              { label: 'Ambiente', value: ratingSummary?.avgMatch != null ? `⭐ ${ratingSummary.avgMatch}` : '—' },
              { label: 'Nivel', value: ratingSummary?.avgLevel != null ? `⭐ ${ratingSummary.avgLevel}` : '—' },
            ].map((s) => (
              <View key={s.label} style={[styles.statBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F4F7F2', borderColor: tokens.borderDark }]}>
                <Text style={[styles.statLabel, { color: tokens.textMuted }]}>{s.label}</Text>
                <Text style={[styles.statValue, { color: tokens.textPrimary }]}>{s.value}</Text>
              </View>
            ))}
          </View>
          {topMvp ? (
            <Text style={[styles.mvpLine, { color: tokens.textPrimary }]}>
              🏅 MVP: {topMvp.name} ({topMvp.votes} {topMvp.votes === 1 ? 'voto' : 'votos'})
            </Text>
          ) : null}
          {recentComments.length > 0 ? (
            <>
              <Text style={[styles.commentsTitle, { color: tokens.textMuted }]}>Comentarios</Text>
              {recentComments.map((c) => (
                <View key={`${c.createdAt.toISOString()}-${c.comment.slice(0, 12)}`} style={[styles.commentBubble, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F4F7F2' }]}>
                  <Text style={[styles.commentText, { color: tokens.textPrimary }]}>"{c.comment}"</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>
      )}

      {canJoin && !isRivalMatch ? (
        <View style={[styles.joinCard, { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark }]}>
          <Text style={[styles.joinCardTitle, { color: tokens.textPrimary }]}>Únete al partido</Text>
          <Text style={[styles.joinCardSub, { color: tokens.textMuted }]}>
            {isTeamPickType(opp.type)
                ? 'Elige equipo y posición en la cancha.'
                : 'Confirma tu participación en este partido.'}
          </Text>

          {isTeamPickType(opp.type) ? (
            <>
              <Text style={[styles.fieldLabel, { color: tokens.textMuted }]}>Equipo</Text>
              <View style={styles.choiceRow}>
                {(['A', 'B'] as const).map((t) => {
                  const active = teamPickTeam === t
                  return (
                    <Pressable
                      key={t}
                      style={[
                        styles.teamChoice,
                        { borderColor: tokens.borderDark, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF7' },
                        active && { borderColor: tokens.primaryGreen, backgroundColor: tokens.primaryGreen + '18' },
                      ]}
                      onPress={() => {
                        setTeamPickTeam(t)
                        setHighlightTeam(t)
                      }}
                    >
                      <Text style={[styles.teamChoiceLetter, { color: active ? tokens.primaryGreen : tokens.textMuted }]}>
                        {t}
                      </Text>
                      <Text style={[styles.teamChoiceLabel, { color: active ? tokens.textPrimary : tokens.textMuted }]}>
                        Equipo {t}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <Text style={[styles.fieldLabel, { color: tokens.textMuted }]}>Tu rol</Text>
              <View style={styles.choiceWrap}>
                {(
                  [
                    { key: 'gk' as const, label: 'Arquero', icon: 'hand-left-outline' as const },
                    { key: 'defensa' as const, label: 'Defensa', icon: 'shield-outline' as const },
                    { key: 'mediocampista' as const, label: 'Medio', icon: 'git-commit-outline' as const },
                    { key: 'delantero' as const, label: 'Delantero', icon: 'flash-outline' as const },
                  ]
                ).map((item) => {
                  const active = teamPickRole === item.key
                  return (
                    <Pressable
                      key={item.key}
                      style={[
                        styles.roleChoice,
                        { borderColor: tokens.borderDark, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF7' },
                        active && { borderColor: tokens.accentGold, backgroundColor: tokens.accentGold + '18' },
                      ]}
                      onPress={() => setTeamPickRole(item.key)}
                    >
                      <Ionicons name={item.icon} size={16} color={active ? tokens.accentGold : tokens.textMuted} />
                      <Text style={[styles.roleChoiceText, { color: active ? tokens.textPrimary : tokens.textMuted }]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {isPrivateTeamPick ? (
                <>
                  <Text style={[styles.fieldLabel, { color: tokens.textMuted }]}>Código privado</Text>
                  <TextInput
                    style={[styles.codeInput, { borderColor: tokens.borderDark, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAF7', color: tokens.textPrimary }]}
                    value={teamPickJoinCode}
                    onChangeText={(t) => setTeamPickJoinCode(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="0000"
                    placeholderTextColor={tokens.textMuted}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {showGkToggle ? (
            <View style={[styles.switchRow, { borderTopColor: tokens.borderDark }]}>
              <View style={styles.switchLabelRow}>
                <Ionicons name="hand-left-outline" size={18} color={tokens.textMuted} />
                <Text style={[styles.switchLabel, { color: tokens.textPrimary }]}>Ir de arquero</Text>
              </View>
              <Switch
                value={wantGk}
                onValueChange={setWantGk}
                trackColor={{ false: tokens.borderDark, true: tokens.primaryGreen + '88' }}
                thumbColor={wantGk ? tokens.primaryGreen : '#f4f4f5'}
              />
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryBtn, { backgroundColor: tokens.primaryGreen }, busy && styles.primaryBtnDisabled]}
            onPress={() => void onJoin()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={22} color="#fff" />
                <Text style={styles.primaryBtnText}>Apuntarse al partido</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {isRivalMatch && !userRivalPickTeam && !involved ? (
        <View style={[styles.tipBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0F5EF', marginTop: 8 }]}>
          <Ionicons name="information-circle-outline" size={18} color={tokens.textMuted} />
          <Text style={[styles.muted, { color: tokens.textMuted }]}>
            Puedes ver este encuentro. Solo jugadores de los equipos del desafío pueden inscribirse en la
            plantilla.
          </Text>
        </View>
      ) : !canJoin && !involved && !isRivalMatch ? (
        <View style={[styles.tipBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0F5EF', marginTop: 8 }]}>
          <Ionicons name="information-circle-outline" size={18} color={tokens.textMuted} />
          <Text style={[styles.muted, { color: tokens.textMuted }]}>
            No puedes unirte (género, fecha, cupos o estado del partido).
          </Text>
        </View>
      ) : null}

      <MatchCompletionPanel
        opportunity={opp}
        currentUserId={currentUser.id}
        participants={participants}
        myRating={myRating}
        loadingRating={loadingRating}
        onReloadMyRating={() => {
          void loadRatingsOverview()
        }}
        finalizeMatchOpportunity={finalizeMatchOpportunity}
        suspendMatchOpportunity={suspendMatchOpportunity}
        submitMatchRating={submitMatchRating}
      />
    </ScrollView>
    <PublicPlayerProfileModal
      visible={profileUserId != null}
      userId={profileUserId}
      currentUserId={currentUser.id}
      contextType="match"
      contextId={opp.id}
      onClose={() => setProfileUserId(null)}
    />
    </Fragment>
  )
}

function InfoRow({
  icon,
  label,
  value,
  tokens,
}: {
  icon: ComponentProps<typeof Ionicons>['name']
  label: string
  value: string
  tokens: { textPrimary: string; textMuted: string; primaryGreen: string }
}) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIconWrap, { backgroundColor: tokens.primaryGreen + '18' }]}>
        <Ionicons name={icon} size={18} color={tokens.primaryGreen} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={[styles.infoLabel, { color: tokens.textMuted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: tokens.textPrimary }]}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  hero: { marginBottom: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  typePillText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', lineHeight: 32, letterSpacing: -0.3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipAccent: {},
  chipText: { fontSize: 12, fontWeight: '600' },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  lineupCard: { paddingBottom: 12, overflow: 'hidden' },
  sectionHead: { marginBottom: 8 },
  sectionSub: { fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextWrap: { flex: 1 },
  infoLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 15, fontWeight: '600', marginTop: 2, lineHeight: 21 },
  descLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  desc: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  progressCount: { fontSize: 18, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  progressHint: { fontSize: 12, marginTop: 8 },
  orgCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e5e7eb' },
  orgBody: { flex: 1 },
  orgLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  orgName: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  inBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  chatBtnText: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  leaveRivalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  leaveRivalBtnText: { fontSize: 15, fontWeight: '700' },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  lineupJoinHint: { flex: 1, fontSize: 12, lineHeight: 17 },
  joinCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
    marginTop: 4,
  },
  joinCardTitle: { fontSize: 18, fontWeight: '800' },
  joinCardSub: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 8,
  },
  choiceRow: { flexDirection: 'row', gap: 10 },
  teamChoice: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  teamChoiceLetter: { fontSize: 22, fontWeight: '900' },
  teamChoiceLabel: { fontSize: 12, fontWeight: '600' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  roleChoiceText: { fontSize: 13, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  switchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 15, fontWeight: '600' },
  codeInput: {
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 22,
    letterSpacing: 8,
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 16,
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  muted: { flex: 1, fontSize: 13, lineHeight: 18 },
  btnGhost: { marginTop: 16, padding: 12 },
  btnGhostText: { color: '#2563eb', fontWeight: '600' },
  mutedLeft: { fontSize: 14, paddingVertical: 8 },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  partAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5e7eb' },
  partName: { flex: 1, fontSize: 14, fontWeight: '600' },
  partBadge: { fontSize: 11, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  statBox: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  commentsTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  mvpLine: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  commentBubble: { borderRadius: 10, padding: 12, marginTop: 6 },
  commentText: { fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
})
