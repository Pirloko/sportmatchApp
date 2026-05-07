import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { createClient, isSupabaseConfigured } from '../lib/supabase/client'
import {
  fetchParticipantsForOpportunity,
  type OpportunityParticipantRow,
} from '../lib/supabase/message-queries'
import {
  fetchMyRatingForOpportunity,
  fetchRatingSummaryForOpportunity,
  fetchRecentRatingCommentsForOpportunity,
  type MatchOpportunityRatingRow,
  type RatingSummary,
} from '../lib/supabase/rating-queries'
import { MatchCompletionPanel } from './match-completion-panel'

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
    getUserTeams,
    joinMatchOpportunity,
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
  const { resolved } = useThemePreference()
  const isDark = resolved === 'dark'
  const ui = isDark
    ? {
        bg: '#090B0A',
        surface: '#141717',
        border: '#2C3131',
        text: '#F5F7F7',
        muted: '#9CA3A3',
      }
    : {
        bg: '#F4F7F2',
        surface: '#FFFFFF',
        border: '#CFD8CE',
        text: '#1F2A22',
        muted: '#667267',
      }

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
      const rows = await fetchParticipantsForOpportunity(createClient(), id)
      setParticipants(rows)
    } finally {
      setLoadingParticipants(false)
    }
  }, [id, currentUser])

  const loadRatingsOverview = useCallback(async () => {
    if (!id || !isSupabaseConfigured()) {
      setRatingSummary(null)
      setRecentComments([])
      return
    }
    const supabase = createClient()
    const [summary, comments] = await Promise.all([
      fetchRatingSummaryForOpportunity(supabase, id),
      fetchRecentRatingCommentsForOpportunity(supabase, id),
    ])
    setRatingSummary(summary)
    setRecentComments(comments)
  }, [id])

  const loadMyRating = useCallback(async () => {
    if (!id || !currentUser || !isSupabaseConfigured()) {
      setMyRating(null)
      return
    }
    setLoadingRating(true)
    try {
      const row = await fetchMyRatingForOpportunity(
        createClient(),
        id,
        currentUser.id
      )
      setMyRating(row)
    } finally {
      setLoadingRating(false)
    }
  }, [id, currentUser])

  useEffect(() => {
    void loadParticipants()
    void loadMyRating()
    void loadRatingsOverview()
  }, [loadParticipants, loadMyRating, loadRatingsOverview])

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

  const canJoin = useMemo(() => {
    if (!currentUser || !opp || involved) return false
    if (currentUser.accountType !== 'player') return false
    if (opp.gender !== currentUser.gender) return false
    if (opp.status !== 'pending' && opp.status !== 'confirmed') return false
    if (opp.dateTime.getTime() < midnight.getTime()) return false
    return true
  }, [currentUser, opp, involved, midnight])

  const joinRules = opp ? playersJoinRules(opp) : null
  const seekLabel = opp ? playersSeekProfileLabel(opp.playersSeekProfile) : ''
  const isPrivateTeamPick = opp?.type === 'team_pick_private'

  const isParticipant = participatingOpportunityIds.includes(opp?.id ?? '')

  const onJoin = async () => {
    if (!opp || !id) return
    if (isTeamPickType(opp.type) && getUserTeams().length === 0) {
      Alert.alert('Equipo requerido', 'Para team pick debes pertenecer a un equipo.')
      return
    }
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
        Alert.alert('Listo', 'Te uniste al partido.', [
          { text: 'OK', onPress: () => router.back() },
        ])
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

  if (
    !currentUser ||
    (currentUser.accountType !== 'player' && currentUser.accountType !== 'admin')
  ) {
    return (
      <View style={styles.center}>
        <Text style={[styles.muted, { color: ui.muted }]}>Solo jugadores y admin.</Text>
      </View>
    )
  }

  if (!opp) {
    if (loadingOpp) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      )
    }
    return (
      <View style={styles.center}>
        <Text style={[styles.muted, { color: ui.muted }]}>No encontramos este partido.</Text>
        <Pressable style={styles.btnGhost} onPress={() => void refreshMatchData()}>
          <Text style={styles.btnGhostText}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  const showGkToggle =
    canJoin &&
    (opp.type === 'open' ||
      (opp.type === 'players' && joinRules?.kind === 'mixed'))

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: ui.bg }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: ui.text }]}>{opp.title}</Text>
      <Text style={[styles.meta, { color: ui.muted }]}>{formatMatchDateTime(opp.dateTime)}</Text>
      <Text style={[styles.meta, { color: ui.muted }]}>
        {opp.venue} · {opp.location}
      </Text>
      <Text style={[styles.meta, { color: ui.muted }]}>
        Nivel {levelLabel(opp.level)} · {matchTypeLabel(opp.type)} ·{' '}
        {opp.gender === 'male' ? 'Hombres' : 'Mujeres'}
      </Text>
      {opp.description ? (
        <Text style={[styles.desc, { color: ui.text }]}>{opp.description}</Text>
      ) : null}
      {opp.playersNeeded != null ? (
        <Text style={[styles.meta, { color: ui.muted }]}>
          Jugadores: {opp.playersJoined ?? 0} / {opp.playersNeeded}
        </Text>
      ) : null}
      {seekLabel ? <Text style={styles.hint}>{seekLabel}</Text> : null}

      <View style={styles.orgRow}>
        <Image source={{ uri: opp.creatorPhoto }} style={styles.avatar} />
        <View>
          <Text style={[styles.orgLabel, { color: ui.muted }]}>Organizador</Text>
          <Text style={[styles.orgName, { color: ui.text }]}>{opp.creatorName}</Text>
        </View>
      </View>

      {involved ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            Estás en este partido (estado: {opp.status})
          </Text>
        </View>
      ) : null}

      {involved && id ? (
        <Pressable
          style={styles.chatBtn}
          onPress={() => router.push(`/partidos/chat/${id}`)}
        >
          <Text style={styles.chatBtnText}>Abrir chat del partido</Text>
        </Pressable>
      ) : null}

      <View style={[styles.card, { backgroundColor: ui.surface, borderColor: ui.border }]}>
        <Text style={styles.cardTitle}>Participantes</Text>
        {loadingParticipants ? (
          <Text style={[styles.mutedLeft, { color: ui.muted }]}>Cargando participantes…</Text>
        ) : participants.length > 0 ? (
          participants.map((p) => (
            <View key={p.id} style={styles.partRow}>
              <Image source={{ uri: p.photo }} style={styles.partAvatar} />
              <Text style={[styles.partName, { color: ui.text }]} numberOfLines={1}>
                {p.name}
                {(opp.type === 'open' || opp.type === 'players') && p.isGoalkeeper
                  ? ' 🧤'
                  : ''}
              </Text>
              <Text style={[styles.partBadge, { color: ui.muted }]}>
                {p.status === 'creator'
                  ? 'Organizador'
                  : p.status === 'confirmed'
                    ? 'Confirmado'
                    : p.status === 'pending'
                      ? 'Pendiente'
                      : p.status === 'invited'
                        ? 'Invitado'
                        : 'Cancelado'}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.mutedLeft, { color: ui.muted }]}>Sin participantes aún.</Text>
        )}
      </View>

      {(opp.status === 'completed' || (ratingSummary?.count ?? 0) > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calificaciones del partido</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Reseñas</Text>
              <Text style={styles.statValue}>
                {String(ratingSummary?.count ?? 0)}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>General</Text>
              <Text style={styles.statValue}>
                {ratingSummary?.avgOverall != null
                  ? `⭐ ${ratingSummary.avgOverall}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Partido</Text>
              <Text style={styles.statValue}>
                {ratingSummary?.avgMatch != null
                  ? `⭐ ${ratingSummary.avgMatch}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Nivel</Text>
              <Text style={styles.statValue}>
                {ratingSummary?.avgLevel != null
                  ? `⭐ ${ratingSummary.avgLevel}`
                  : '—'}
              </Text>
            </View>
          </View>
          <Text style={styles.orgRatingHint}>
            Gestión organizador:{' '}
            {ratingSummary?.avgOrganizer != null
              ? `⭐ ${ratingSummary.avgOrganizer}`
              : 'Sin datos aún'}
          </Text>
          {recentComments.length > 0 ? (
            <>
              <Text style={styles.commentsTitle}>Comentarios recientes</Text>
              {recentComments.map((c) => (
                <View
                  key={`${c.createdAt.toISOString()}-${c.comment.slice(0, 12)}`}
                  style={styles.commentBubble}
                >
                  <Text style={styles.commentText}>“{c.comment}”</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.mutedLeft}>Aún no hay comentarios en este partido.</Text>
          )}
        </View>
      )}

      {canJoin ? (
        <View style={styles.joinBox}>
          {isTeamPickType(opp.type) ? (
            <>
              <Text style={styles.switchLabel}>Equipo</Text>
              <View style={styles.choiceRow}>
                <Pressable
                  style={[
                    styles.choiceBtn,
                    teamPickTeam === 'A' && styles.choiceBtnActive,
                  ]}
                  onPress={() => setTeamPickTeam('A')}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      teamPickTeam === 'A' && styles.choiceTextActive,
                    ]}
                  >
                    Equipo A
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.choiceBtn,
                    teamPickTeam === 'B' && styles.choiceBtnActive,
                  ]}
                  onPress={() => setTeamPickTeam('B')}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      teamPickTeam === 'B' && styles.choiceTextActive,
                    ]}
                  >
                    Equipo B
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.switchLabel}>Rol</Text>
              <View style={styles.choiceWrap}>
                {(
                  [
                    { key: 'gk', label: 'Arquero' },
                    { key: 'defensa', label: 'Defensa' },
                    { key: 'mediocampista', label: 'Mediocampista' },
                    { key: 'delantero', label: 'Delantero' },
                  ] as const
                ).map((item) => (
                  <Pressable
                    key={item.key}
                    style={[
                      styles.choiceBtn,
                      teamPickRole === item.key && styles.choiceBtnActive,
                    ]}
                    onPress={() => setTeamPickRole(item.key)}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        teamPickRole === item.key && styles.choiceTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {isPrivateTeamPick ? (
                <>
                  <Text style={styles.switchLabel}>Código privado</Text>
                  <TextInput
                    style={styles.codeInput}
                    value={teamPickJoinCode}
                    onChangeText={(t) =>
                      setTeamPickJoinCode(t.replace(/\D/g, '').slice(0, 4))
                    }
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="0000"
                    placeholderTextColor="#9ca3af"
                  />
                </>
              ) : null}
            </>
          ) : null}
          {showGkToggle ? (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Ir de arquero</Text>
              <Switch value={wantGk} onValueChange={setWantGk} />
            </View>
          ) : null}
          <Pressable
            style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
            onPress={() => void onJoin()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Apuntarse</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {!canJoin && !involved ? (
        <Text style={[styles.muted, { color: ui.muted }]}>
          No puedes unirte (género, fecha pasada, cupos o estado del partido).
        </Text>
      ) : null}

      <MatchCompletionPanel
        opportunity={opp}
        currentUserId={currentUser.id}
        isConfirmedParticipant={isParticipant}
        myRating={myRating}
        loadingRating={loadingRating}
        onReloadMyRating={() => {
          void loadMyRating()
          void loadRatingsOverview()
        }}
        finalizeMatchOpportunity={finalizeMatchOpportunity}
        suspendMatchOpportunity={suspendMatchOpportunity}
        submitMatchRating={submitMatchRating}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 8 },
  meta: { fontSize: 15, color: '#6b7280', marginTop: 4 },
  desc: { fontSize: 15, color: '#374151', marginTop: 14, lineHeight: 22 },
  hint: { fontSize: 14, color: '#1d4ed8', marginTop: 10, fontWeight: '600' },
  orgRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e5e7eb' },
  orgLabel: { fontSize: 12, color: '#9ca3af' },
  orgName: { fontSize: 16, fontWeight: '600', color: '#111' },
  pill: {
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
  },
  pillText: { color: '#065f46', fontWeight: '600' },
  chatBtn: {
    marginTop: 14,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  chatBtnText: { fontSize: 16, fontWeight: '700', color: '#2563eb' },
  joinBox: { marginTop: 24 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  switchLabel: { fontSize: 16, color: '#374151' },
  choiceRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  choiceBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  choiceBtnActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  choiceText: { color: '#374151', fontWeight: '600' },
  choiceTextActive: { color: '#1d4ed8' },
  codeInput: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    paddingVertical: 12,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 6,
    color: '#111',
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  muted: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
  btnGhost: { marginTop: 16, padding: 12 },
  btnGhostText: { color: '#2563eb', fontWeight: '600' },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
  mutedLeft: { fontSize: 14, color: '#6b7280' },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  partAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb' },
  partName: { flex: 1, fontSize: 14, color: '#111' },
  partBadge: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBox: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
    padding: 8,
  },
  statLabel: { fontSize: 11, color: '#6b7280' },
  statValue: { fontSize: 14, fontWeight: '700', color: '#111', marginTop: 2 },
  orgRatingHint: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  commentsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  commentBubble: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  commentText: { fontSize: 14, color: '#4b5563' },
})
