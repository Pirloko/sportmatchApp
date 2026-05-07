import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FlashList, type ListRenderItem } from '@shopify/flash-list'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  formatMatchDateTime,
  levelLabel,
  matchTypeLabel,
  startOfToday,
} from '../lib/format-match'
import type { MatchOpportunity } from '../lib/types'
import { useApp } from '../lib/app-provider'
import { useThemePreference } from '../lib/theme-context'
import { createClient, isSupabaseConfigured } from '../lib/supabase/client'
import {
  fetchInvitedOpportunityIds,
  fetchLastMessagesForOpportunities,
  type LastMessagePreview,
} from '../lib/supabase/message-queries'

function isUserInvolved(
  m: MatchOpportunity,
  userId: string,
  participatingIds: string[]
) {
  return m.creatorId === userId || participatingIds.includes(m.id)
}

type Tab = 'upcoming' | 'invitations' | 'chats' | 'past'

export function MatchesHubScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>()
  const {
    currentUser,
    matchOpportunities,
    participatingOpportunityIds,
    refreshMatchData,
    respondToMatchInvitation,
  } = useApp()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [refreshing, setRefreshing] = useState(false)
  const [lastByOpp, setLastByOpp] = useState<
    Map<string, LastMessagePreview>
  >(new Map())
  const [invitedIds, setInvitedIds] = useState<string[]>([])
  const [respondingInvitationId, setRespondingInvitationId] = useState<string | null>(
    null
  )
  const { resolved } = useThemePreference()
  const isDark = resolved === 'dark'
  const ui = useMemo(
    () =>
      isDark
        ? {
            bg: '#0F1115',
            surface: '#171B22',
            surfaceAlt: '#202630',
            border: '#2C3340',
            text: '#F3F6FB',
            muted: '#A2ACB8',
            tabOnBg: '#66D06F',
            tabOnText: '#0D0F0E',
            badgeBg: 'rgba(102, 208, 111, 0.25)',
            cardHeadBg: '#2A3038',
            cardHeadText: '#E8EDF5',
            detailBtnBg: '#F3F6FB',
            detailBtnText: '#0D0F0E',
            progressTrack: '#2A323E',
            sectionSoft: '#27313C',
            underline: '#66D06F',
            chipBg: '#171B22',
            chipBorder: '#2C3340',
            shadow: '#000000',
          }
        : {
            bg: '#F4F7F2',
            surface: '#FFFFFF',
            surfaceAlt: '#EEF3EC',
            border: '#CFD8CE',
            text: '#1F2A22',
            muted: '#667267',
            tabOnBg: '#0F4539',
            tabOnText: '#FFFFFF',
            badgeBg: 'rgba(47, 158, 68, 0.20)',
            cardHeadBg: '#F2EBCF',
            cardHeadText: '#4A3D1F',
            detailBtnBg: '#0D0F0E',
            detailBtnText: '#FFFFFF',
            progressTrack: '#DEE7DD',
            sectionSoft: '#F6F0DA',
            underline: '#0F4539',
            chipBg: '#FFFFFF',
            chipBorder: '#CFD8CE',
            shadow: '#0F172A',
          },
    [isDark]
  )
  const currentUserId = currentUser?.id ?? null

  useEffect(() => {
    if (tabParam === 'chats') setTab('chats')
    else if (tabParam === 'mine' || tabParam === 'upcoming' || tabParam === 'proximos') {
      setTab('upcoming')
    }
    else if (tabParam === 'invitaciones' || tabParam === 'invitations') {
      setTab('invitations')
    }
    else if (
      tabParam === 'explore' ||
      tabParam === 'past' ||
      tabParam === 'finalizados' ||
      tabParam === 'completed'
    ) {
      setTab('past')
    }
  }, [tabParam])

  const midnight = useMemo(() => startOfToday(), [])

  const myInvolved = useMemo(() => {
    if (!currentUser) return []
    return matchOpportunities.filter((m) =>
      isUserInvolved(m, currentUser.id, participatingOpportunityIds)
    )
  }, [matchOpportunities, currentUser, participatingOpportunityIds])

  const upcomingMine = useMemo(
    () =>
      myInvolved
        .filter(
          (m) =>
            (m.status === 'pending' || m.status === 'confirmed') &&
            m.dateTime.getTime() >= midnight.getTime()
        )
        .sort(
          (a, b) => a.dateTime.getTime() - b.dateTime.getTime()
        ),
    [myInvolved, midnight]
  )

  const pastMine = useMemo(
    () =>
      myInvolved
        .filter(
          (m) =>
            m.status === 'completed' ||
            m.status === 'cancelled' ||
            ((m.status === 'pending' || m.status === 'confirmed') &&
              m.dateTime.getTime() < midnight.getTime())
        )
        .sort(
          (a, b) => b.dateTime.getTime() - a.dateTime.getTime()
        ),
    [myInvolved, midnight]
  )

  const exploreList = useMemo(() => {
    if (!currentUser) return []
    return matchOpportunities
      .filter(
        (m) =>
          m.gender === currentUser.gender &&
          (m.status === 'pending' || m.status === 'confirmed') &&
          m.dateTime.getTime() >= midnight.getTime() &&
          !isUserInvolved(m, currentUser.id, participatingOpportunityIds)
      )
      .sort(
        (a, b) => a.dateTime.getTime() - b.dateTime.getTime()
      )
  }, [
    matchOpportunities,
    currentUser,
    participatingOpportunityIds,
    midnight,
  ])

  const invitationsList = useMemo(() => {
    const invitedSet = new Set(invitedIds)
    return matchOpportunities
      .filter((m) => invitedSet.has(m.id))
      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
  }, [matchOpportunities, invitedIds])

  const chatOpportunities = myInvolved

  const sortedChats = useMemo(() => {
    const list = [...chatOpportunities]
    list.sort((a, b) => {
      const ta =
        lastByOpp.get(a.id)?.createdAt.getTime() ?? a.dateTime.getTime()
      const tb =
        lastByOpp.get(b.id)?.createdAt.getTime() ?? b.dateTime.getTime()
      return tb - ta
    })
    return list
  }, [chatOpportunities, lastByOpp])

  useEffect(() => {
    if (!isSupabaseConfigured() || chatOpportunities.length === 0) {
      setLastByOpp(new Map())
      return
    }
    const supabase = createClient()
    void fetchLastMessagesForOpportunities(
      supabase,
      chatOpportunities.map((c) => c.id)
    ).then(setLastByOpp)
  }, [chatOpportunities])

  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) {
      setInvitedIds([])
      return
    }
    const supabase = createClient()
    void fetchInvitedOpportunityIds(supabase, currentUser.id).then(setInvitedIds)
  }, [currentUser?.id, matchOpportunities])

  const data =
    tab === 'upcoming'
      ? upcomingMine
      : tab === 'invitations'
        ? invitationsList
        : tab === 'past'
          ? pastMine
          : sortedChats

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshMatchData()
      if (currentUser && isSupabaseConfigured()) {
        const supabase = createClient()
        const ids = await fetchInvitedOpportunityIds(supabase, currentUser.id)
        setInvitedIds(ids)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const renderItem = useCallback<ListRenderItem<MatchOpportunity>>(
    ({ item: m }) => {
    const isPast =
      m.status === 'completed' ||
      m.status === 'cancelled' ||
      ((m.status === 'pending' || m.status === 'confirmed') &&
        m.dateTime.getTime() < midnight.getTime())
    const last = lastByOpp.get(m.id)
    const isInvitationRow = tab === 'invitations'
    const invitationBusy = respondingInvitationId === m.id
    const dateTop = formatMatchDateTime(m.dateTime)
    const pct =
      m.playersNeeded && m.playersNeeded > 0
        ? Math.max(0, Math.min(1, (m.playersJoined ?? 0) / m.playersNeeded))
        : 0
    return (
      <Pressable
        style={[
          styles.card,
          {
            backgroundColor: ui.surface,
            borderColor: ui.border,
            shadowColor: ui.shadow,
          },
          isPast && styles.cardPast,
        ]}
        onPress={() =>
          tab === 'chats'
            ? router.push(`/partidos/chat/${m.id}`)
            : router.push(`/partidos/${m.id}`)
        }
      >
        <View style={[styles.cardHead, { backgroundColor: ui.cardHeadBg }]}>
          <View style={styles.cardHeadLeft}>
            <View style={[styles.typeIconWrap, { backgroundColor: ui.sectionSoft }]}>
              <Ionicons
                name={
                  m.type === 'open'
                    ? 'shuffle-outline'
                    : m.type === 'players'
                      ? 'people-outline'
                      : m.type === 'rival'
                        ? 'shield-outline'
                        : 'git-compare-outline'
                }
                size={14}
                color={isDark ? '#B6C4B8' : '#8A7332'}
              />
            </View>
            <Text style={[styles.cardHeadDate, { color: ui.cardHeadText }]} numberOfLines={1}>
              {matchTypeLabel(m.type)}
            </Text>
          </View>
          <View style={[styles.typeChip, { borderColor: ui.border }]}>
            <Text style={[styles.typeChipText, { color: ui.cardHeadText }]}>
              {levelLabel(m.level)}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardIdentity}>
            <View style={[styles.avatarFallback, { borderColor: ui.border }]}>
              <Ionicons name="football-outline" size={18} color={ui.muted} />
            </View>
            <View style={styles.cardIdentityText}>
              <Text style={[styles.cardTitle, { color: ui.text }]} numberOfLines={2}>
                {m.title}
              </Text>
              <Text style={[styles.cardMeta, { color: ui.muted }]} numberOfLines={2}>
                {m.description?.trim() || 'Sin descripción aún'}
              </Text>
            </View>
            {m.creatorId === currentUserId ? (
              <View style={[styles.rolePill, { borderColor: ui.tabOnBg }]}>
                <Text style={[styles.rolePillText, { color: ui.tabOnBg }]}>
                  Organiza
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaInline}>
              <Ionicons name="calendar-outline" size={16} color={ui.tabOnBg} />
              <Text style={[styles.metaInlineText, { color: ui.muted }]}>{dateTop}</Text>
            </View>
            <View style={styles.metaInline}>
              <Ionicons name="location-outline" size={16} color={ui.tabOnBg} />
              <Text style={[styles.metaInlineText, { color: ui.muted }]}>{m.location}</Text>
            </View>
          </View>

          {tab === 'chats' && last ? (
            <Text style={[styles.lastMsg, { color: ui.text }]} numberOfLines={2}>
              {last.content}
            </Text>
          ) : null}
          {m.playersNeeded != null && tab !== 'chats' ? (
            <View style={styles.cardPlayersWrap}>
              <Text style={[styles.cardMeta, { color: ui.muted }]}>
                Cupos {m.playersJoined ?? 0}/{m.playersNeeded}
              </Text>
              <View style={[styles.progressTrack, { backgroundColor: ui.progressTrack }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(pct * 100)}%`, backgroundColor: ui.tabOnBg },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </View>
        {tab === 'past' ? (
          <Text style={[styles.badgePast, { color: isDark ? '#facc15' : '#a16207' }]}>
            Historial
          </Text>
        ) : null}
        {tab !== 'invitations' ? (
          <View style={styles.cardActions}>
            <Pressable
              style={[
                styles.detailBtn,
                { backgroundColor: ui.detailBtnBg },
              ]}
              onPress={() =>
                tab === 'chats'
                  ? router.push(`/partidos/chat/${m.id}`)
                  : router.push(`/partidos/${m.id}`)
              }
            >
              <Text style={[styles.detailBtnText, { color: ui.detailBtnText }]}>
                {tab === 'chats' ? 'Abrir chat' : 'Detalles'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {isInvitationRow ? (
          <View style={styles.invitationActions}>
            <Pressable
              style={[
                styles.invitationBtn,
                styles.invitationRejectBtn,
                invitationBusy && styles.invitationBtnDisabled,
              ]}
              disabled={invitationBusy}
              onPress={() => {
                if (!currentUserId) return
                setRespondingInvitationId(m.id)
                void (async () => {
                  const res = await respondToMatchInvitation(m.id, false)
                  setRespondingInvitationId(null)
                  if (!res.ok) {
                    Alert.alert('No se pudo rechazar', res.error || 'Error desconocido')
                    return
                  }
                  const supabase = createClient()
                  const ids = await fetchInvitedOpportunityIds(supabase, currentUserId)
                  setInvitedIds(ids)
                })()
              }}
            >
              <Text style={styles.invitationRejectText}>Rechazar</Text>
            </Pressable>
            <Pressable
              style={[
                styles.invitationBtn,
                styles.invitationAcceptBtn,
                invitationBusy && styles.invitationBtnDisabled,
              ]}
              disabled={invitationBusy}
              onPress={() => {
                if (!currentUserId) return
                setRespondingInvitationId(m.id)
                void (async () => {
                  const res = await respondToMatchInvitation(m.id, true)
                  setRespondingInvitationId(null)
                  if (!res.ok) {
                    Alert.alert('No se pudo aceptar', res.error || 'Error desconocido')
                    return
                  }
                  const supabase = createClient()
                  const ids = await fetchInvitedOpportunityIds(supabase, currentUserId)
                  setInvitedIds(ids)
                  Alert.alert('Invitación aceptada', 'Ya te uniste al partido.')
                })()
              }}
            >
              <Text style={styles.invitationAcceptText}>Aceptar</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    )
    },
    [
      tab,
      midnight,
      lastByOpp,
      currentUserId,
      respondingInvitationId,
      ui,
      respondToMatchInvitation,
      isDark,
    ]
  )

  if (!currentUser || currentUser.accountType !== 'player') {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyText, { color: ui.muted }]}>
          Los partidos en la app Expo están disponibles para cuentas jugador.
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: ui.bg }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: ui.bg, borderBottomColor: ui.border }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: ui.text }]}>Partidos</Text>
        </View>
        <Text style={[styles.headerSub, { color: ui.muted }]}>
          Próximos, invitaciones, chats e historial
        </Text>
      </View>

      <View style={[styles.tabs, { backgroundColor: ui.bg, borderBottomColor: ui.border }]}>
        <TopTab
          label="Próximos"
          icon="time-outline"
          active={tab === 'upcoming'}
          onPress={() => setTab('upcoming')}
          activeColor={ui.tabOnBg}
          textColor={ui.muted}
          bgColor={ui.chipBg}
          borderColor={ui.chipBorder}
          underlineColor={ui.underline}
        />
        <TopTab
          label="Invitaciones"
          icon="shield-checkmark-outline"
          active={tab === 'invitations'}
          onPress={() => setTab('invitations')}
          activeColor={ui.tabOnBg}
          textColor={ui.muted}
          bgColor={ui.chipBg}
          borderColor={ui.chipBorder}
          badge={invitationsList.length > 0 ? String(invitationsList.length) : undefined}
          badgeBg={ui.badgeBg}
          underlineColor={ui.underline}
        />
        <TopTab
          label="Chats"
          icon="chatbubble-outline"
          active={tab === 'chats'}
          onPress={() => setTab('chats')}
          activeColor={ui.tabOnBg}
          textColor={ui.muted}
          bgColor={ui.chipBg}
          borderColor={ui.chipBorder}
          underlineColor={ui.underline}
        />
        <TopTab
          label="Finalizados"
          icon="checkmark-done-outline"
          active={tab === 'past'}
          onPress={() => setTab('past')}
          activeColor={ui.tabOnBg}
          textColor={ui.muted}
          bgColor={ui.chipBg}
          borderColor={ui.chipBorder}
          badge={pastMine.length > 0 ? String(pastMine.length) : undefined}
          badgeBg={ui.badgeBg}
          underlineColor={ui.underline}
        />
      </View>

      <FlashList
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: ui.surface, borderColor: ui.border },
            ]}
          >
            <View style={[styles.emptyIconWrap, { backgroundColor: ui.badgeBg }]}>
              <Ionicons name="time-outline" size={26} color={ui.tabOnBg} />
            </View>
            <Text style={[styles.emptyCardTitle, { color: ui.text }]}>
              {tab === 'upcoming'
                ? 'Sin más partidos próximos'
                : tab === 'invitations'
                  ? 'No tienes invitaciones pendientes'
                  : tab === 'chats'
                    ? 'Sin chats por ahora'
                    : 'Aún no tienes historial'}
            </Text>
            <Text style={[styles.emptyCardSub, { color: ui.muted }]}>
              {tab === 'upcoming'
                ? 'Crea uno o únete a una revuelta abierta'
                : tab === 'invitations'
                  ? 'Cuando te inviten a un partido, aparecerá aquí'
                  : tab === 'chats'
                    ? 'Únete a un partido para coordinar con el grupo'
                    : 'Cuando cierres partidos, los verás aquí'}
            </Text>
            <Pressable
              style={[styles.emptyCta, { backgroundColor: ui.tabOnBg }]}
              onPress={() => router.push('/explorar')}
            >
              <Text style={[styles.emptyCtaText, { color: ui.tabOnText }]}>
                Explorar partidos
              </Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  )
}

function TopTab({
  label,
  icon,
  active,
  onPress,
  activeColor,
  textColor,
  bgColor,
  borderColor,
  underlineColor,
  badge,
  badgeBg,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  active: boolean
  onPress: () => void
  activeColor: string
  textColor: string
  bgColor: string
  borderColor: string
  underlineColor: string
  badge?: string
  badgeBg?: string
}) {
  return (
    <Pressable style={styles.topTab} onPress={onPress}>
      <View style={styles.topTabInner}>
        <Ionicons
          name={icon}
          size={15}
          color={active ? activeColor : textColor}
          style={styles.topTabIcon}
        />
        <Text style={[styles.topTabText, { color: active ? activeColor : textColor }]}>
          {label}
        </Text>
        {badge ? (
          <View style={[styles.tabBadge, { backgroundColor: badgeBg ?? 'rgba(116,212,93,0.22)' }]}>
            <Text style={[styles.tabBadgeText, { color: active ? '#0D0F0E' : activeColor }]}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={[
          styles.tabUnderline,
          { backgroundColor: active ? underlineColor : 'transparent' },
        ]}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111' },
  headerSub: { marginTop: 4, fontSize: 15, color: '#6b7280' },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTab: {
    flex: 1,
    alignItems: 'center',
  },
  topTabInner: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 2,
  },
  topTabIcon: { marginTop: 1 },
  topTabText: { fontSize: 12, fontWeight: '700' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  tabBadgeText: { fontSize: 11, fontWeight: '700' },
  tabUnderline: { height: 3, width: '75%', borderRadius: 999, marginTop: 2 },
  lastMsg: {
    fontSize: 14,
    color: '#374151',
    marginTop: 8,
    fontStyle: 'italic',
  },
  listContent: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 0,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHead: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadDate: { fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
  typeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  typeChipText: { fontSize: 12, fontWeight: '700' },
  cardPast: { opacity: 0.88 },
  cardBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  cardIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.10)',
  },
  cardIdentityText: { flex: 1 },
  rolePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rolePillText: { fontSize: 12, fontWeight: '700' },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
    color: '#111',
  },
  cardMeta: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  metaInline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaInlineText: { fontSize: 13, fontWeight: '600' },
  cardPlayersWrap: { marginTop: 10 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 14,
    marginTop: 0,
  },
  detailBtn: {
    minWidth: 126,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: 'center',
  },
  detailBtnText: { fontSize: 16, fontWeight: '800' },
  badgePast: {
    marginTop: 4,
    marginLeft: 16,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  invitationActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  invitationBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  invitationAcceptBtn: {
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    borderColor: 'rgba(22, 163, 74, 0.35)',
  },
  invitationRejectBtn: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderColor: 'rgba(220, 38, 38, 0.35)',
  },
  invitationAcceptText: {
    color: '#166534',
    fontWeight: '700',
  },
  invitationRejectText: {
    color: '#991b1b',
    fontWeight: '700',
  },
  invitationBtnDisabled: {
    opacity: 0.5,
  },
  emptyList: { display: 'none' },
  emptyCard: {
    marginTop: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardTitle: {
    marginTop: 14,
    fontSize: 31,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCardSub: {
    marginTop: 8,
    fontSize: 15,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 18,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyCtaText: { fontSize: 16, fontWeight: '800' },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
})
