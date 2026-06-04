import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  formatMatchDateTime,
  levelLabel,
  matchTypeLabel,
  startOfToday,
} from '../lib/format-match'
import type { Level, MatchOpportunity, MatchType } from '../lib/types'
import { useApp } from '../lib/app-provider'
import { useThemePreference } from '../lib/theme-context'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
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

function isTeamPickType(t: MatchType): boolean {
  return (
    t === 'team_pick' || t === 'team_pick_public' || t === 'team_pick_private'
  )
}

function matchTypeIcon(t: MatchType): keyof typeof Ionicons.glyphMap {
  if (t === 'open') return 'shuffle-outline'
  if (t === 'players') return 'people-outline'
  if (t === 'rival') return 'shield-outline'
  return 'git-compare-outline'
}

function matchHeaderTheme(type: MatchType, isDark: boolean) {
  if (type === 'rival') {
    return {
      bg: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(220,38,38,0.08)',
      text: isDark ? '#FCA5A5' : '#B91C1C',
      iconBg: isDark ? 'rgba(239,68,68,0.25)' : 'rgba(220,38,38,0.12)',
    }
  }
  if (type === 'players') {
    return {
      bg: isDark ? 'rgba(15,69,57,0.22)' : 'rgba(15,69,57,0.08)',
      text: isDark ? '#86EFAC' : '#0F4539',
      iconBg: isDark ? 'rgba(15,69,57,0.35)' : 'rgba(15,69,57,0.12)',
    }
  }
  if (isTeamPickType(type)) {
    return {
      bg: isDark ? 'rgba(34,197,94,0.14)' : 'rgba(22,163,74,0.1)',
      text: isDark ? '#86EFAC' : '#15803D',
      iconBg: isDark ? 'rgba(34,197,94,0.25)' : 'rgba(22,163,74,0.12)',
    }
  }
  return {
    bg: isDark ? 'rgba(245,158,11,0.14)' : '#F2EBCF',
    text: isDark ? '#FCD34D' : '#8A7332',
    iconBg: isDark ? 'rgba(245,158,11,0.22)' : 'rgba(138,115,50,0.14)',
  }
}

function levelChipTheme(level: Level, isDark: boolean) {
  if (level === 'principiante') {
    return {
      bg: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.65)',
      text: isDark ? '#E2E8F0' : '#57534E',
      border: isDark ? 'rgba(148,163,184,0.35)' : 'rgba(120,113,108,0.25)',
    }
  }
  if (level === 'intermedio') {
    return {
      bg: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.7)',
      text: isDark ? '#FCD34D' : '#B45309',
      border: isDark ? 'rgba(245,158,11,0.35)' : 'rgba(180,83,9,0.25)',
    }
  }
  if (level === 'avanzado') {
    return {
      bg: isDark ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.7)',
      text: isDark ? '#FDBA74' : '#C2410C',
      border: isDark ? 'rgba(249,115,22,0.35)' : 'rgba(194,65,12,0.25)',
    }
  }
  return {
    bg: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(255,255,255,0.7)',
    text: isDark ? '#FCA5A5' : '#B91C1C',
    border: isDark ? 'rgba(239,68,68,0.35)' : 'rgba(185,28,28,0.25)',
  }
}

function isPastMatch(m: MatchOpportunity, midnight: Date): boolean {
  return (
    m.status === 'completed' ||
    m.status === 'cancelled' ||
    ((m.status === 'pending' || m.status === 'confirmed') &&
      m.dateTime.getTime() < midnight.getTime())
  )
}

function pastStatusChip(
  m: MatchOpportunity,
  isDark: boolean
): { label: string; color: string; bg: string } | null {
  if (m.status === 'completed') {
    return {
      label: 'Finalizado',
      color: isDark ? '#86EFAC' : '#15803D',
      bg: isDark ? 'rgba(34,197,94,0.18)' : 'rgba(22,163,74,0.12)',
    }
  }
  if (m.status === 'cancelled') {
    return {
      label: 'Cancelado',
      color: isDark ? '#FCA5A5' : '#B91C1C',
      bg: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(220,38,38,0.1)',
    }
  }
  return {
    label: 'Vencido',
    color: isDark ? '#FCD34D' : '#A16207',
    bg: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(217,119,6,0.12)',
  }
}

function emptyStateForTab(tab: Tab): {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle: string
} {
  if (tab === 'upcoming') {
    return {
      icon: 'calendar-outline',
      title: 'Sin partidos próximos',
      subtitle: 'Crea uno nuevo o únete a una revuelta abierta desde Explorar.',
    }
  }
  if (tab === 'invitations') {
    return {
      icon: 'mail-unread-outline',
      title: 'Sin invitaciones',
      subtitle: 'Cuando te inviten a un partido, aparecerá aquí para aceptar o rechazar.',
    }
  }
  if (tab === 'chats') {
    return {
      icon: 'chatbubbles-outline',
      title: 'Sin chats activos',
      subtitle: 'Únete a un partido para coordinar horarios y logística con el grupo.',
    }
  }
  return {
    icon: 'checkmark-done-outline',
    title: 'Sin historial aún',
    subtitle: 'Los partidos finalizados o cancelados se listarán aquí.',
  }
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
    const supabase = getSupabase()
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
    const supabase = getSupabase()
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
        const supabase = getSupabase()
        const ids = await fetchInvitedOpportunityIds(supabase, currentUser.id)
        setInvitedIds(ids)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const renderItem = useCallback<ListRenderItem<MatchOpportunity>>(
    ({ item: m }) => {
      const isPast = isPastMatch(m, midnight)
      const last = lastByOpp.get(m.id)
      const isInvitationRow = tab === 'invitations'
      const invitationBusy = respondingInvitationId === m.id
      const dateTop = formatMatchDateTime(m.dateTime)
      const pct =
        m.playersNeeded && m.playersNeeded > 0
          ? Math.max(0, Math.min(1, (m.playersJoined ?? 0) / m.playersNeeded))
          : 0
      const header = matchHeaderTheme(m.type, isDark)
      const levelChip = levelChipTheme(m.level, isDark)
      const statusChip = isPast ? pastStatusChip(m, isDark) : null
      const isOrganizer = m.creatorId === currentUserId

      const openDetail = () => router.push(`/partidos/${m.id}`)
      const openChat = () => router.push(`/partidos/chat/${m.id}`)

      return (
        <View
          style={[
            styles.card,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              shadowColor: ui.shadow,
            },
          ]}
        >
          <View style={[styles.cardHead, { backgroundColor: header.bg }]}>
            <View style={styles.cardHeadLeft}>
              <View style={[styles.typeIconWrap, { backgroundColor: header.iconBg }]}>
                <Ionicons
                  name={matchTypeIcon(m.type)}
                  size={14}
                  color={header.text}
                />
              </View>
              <Text style={[styles.cardHeadType, { color: header.text }]} numberOfLines={1}>
                {matchTypeLabel(m.type)}
              </Text>
            </View>
            <View
              style={[
                styles.levelChip,
                {
                  backgroundColor: levelChip.bg,
                  borderColor: levelChip.border,
                },
              ]}
            >
              <Text style={[styles.levelChipText, { color: levelChip.text }]}>
                {levelLabel(m.level)}
              </Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <View style={styles.cardIdentity}>
              <View style={[styles.avatarFallback, { borderColor: ui.border }]}>
                <Ionicons name="football-outline" size={20} color={ui.muted} />
              </View>
              <View style={styles.cardIdentityText}>
                <Text style={[styles.cardTitle, { color: ui.text }]} numberOfLines={2}>
                  {m.title}
                </Text>
                <Text style={[styles.cardMeta, { color: ui.muted }]} numberOfLines={2}>
                  {m.description?.trim() || 'Sin descripción aún'}
                </Text>
              </View>
              {isOrganizer && tab !== 'chats' ? (
                <View style={[styles.rolePill, { borderColor: ui.tabOnBg, backgroundColor: ui.badgeBg }]}>
                  <Text style={[styles.rolePillText, { color: ui.tabOnBg }]}>
                    Organiza
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaInline}>
                <Ionicons name="calendar-outline" size={15} color={ui.tabOnBg} />
                <Text style={[styles.metaInlineText, { color: ui.muted }]}>{dateTop}</Text>
              </View>
              <View style={styles.metaInline}>
                <Ionicons name="location-outline" size={15} color={ui.tabOnBg} />
                <Text style={[styles.metaInlineText, { color: ui.muted }]} numberOfLines={1}>
                  {m.location}
                </Text>
              </View>
            </View>

            {tab === 'chats' ? (
              <View style={[styles.chatPreview, { backgroundColor: ui.surfaceAlt, borderColor: ui.border }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={ui.tabOnBg} />
                <Text style={[styles.chatPreviewText, { color: ui.text }]} numberOfLines={2}>
                  {last?.content ?? 'Sin mensajes todavía. Escribe para coordinar.'}
                </Text>
              </View>
            ) : null}

            {m.playersNeeded != null && tab !== 'chats' && tab !== 'past' ? (
              <View style={styles.cardPlayersWrap}>
                <View style={styles.cuposRow}>
                  <Text style={[styles.cuposLabel, { color: ui.muted }]}>Cupos</Text>
                  <Text style={[styles.cuposValue, { color: ui.text }]}>
                    {m.playersJoined ?? 0}/{m.playersNeeded}
                  </Text>
                </View>
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

          <View style={[styles.cardFooter, { borderTopColor: ui.border }]}>
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
                      const supabase = getSupabase()
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
                      const supabase = getSupabase()
                      const ids = await fetchInvitedOpportunityIds(supabase, currentUserId)
                      setInvitedIds(ids)
                      Alert.alert('Invitación aceptada', 'Ya te uniste al partido.')
                    })()
                  }}
                >
                  <Text style={styles.invitationAcceptText}>Aceptar</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {statusChip ? (
                  <View style={[styles.statusChip, { backgroundColor: statusChip.bg }]}>
                    <Text style={[styles.statusChipText, { color: statusChip.color }]}>
                      {statusChip.label}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.footerSpacer} />
                )}
                <Pressable
                  style={[styles.detailBtn, { backgroundColor: ui.detailBtnBg }]}
                  onPress={tab === 'chats' ? openChat : openDetail}
                >
                  <Text style={[styles.detailBtnText, { color: ui.detailBtnText }]}>
                    {tab === 'chats' ? 'Abrir chat' : 'Detalles'}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={ui.detailBtnText}
                    style={styles.detailBtnIcon}
                  />
                </Pressable>
              </>
            )}
          </View>
        </View>
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

      <FlatList
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          (() => {
            const empty = emptyStateForTab(tab)
            return (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: ui.surface, borderColor: ui.border },
                ]}
              >
                <View style={[styles.emptyIconWrap, { backgroundColor: ui.badgeBg }]}>
                  <Ionicons name={empty.icon} size={28} color={ui.tabOnBg} />
                </View>
                <Text style={[styles.emptyCardTitle, { color: ui.text }]}>
                  {empty.title}
                </Text>
                <Text style={[styles.emptyCardSub, { color: ui.muted }]}>
                  {empty.subtitle}
                </Text>
                {tab === 'upcoming' ? (
                  <Pressable
                    style={[styles.emptyCta, { backgroundColor: ui.tabOnBg }]}
                    onPress={() => router.push('/explorar')}
                  >
                    <Text style={[styles.emptyCtaText, { color: ui.tabOnText }]}>
                      Explorar partidos
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          })()
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
        <View style={styles.topTabIconRow}>
          <Ionicons
            name={icon}
            size={16}
            color={active ? activeColor : textColor}
          />
          {badge ? (
            <View style={[styles.tabBadge, { backgroundColor: badgeBg ?? 'rgba(116,212,93,0.22)' }]}>
              <Text style={[styles.tabBadgeText, { color: active ? activeColor : activeColor }]}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.topTabText,
            { color: active ? activeColor : textColor },
            active && styles.topTabTextActive,
          ]}
        >
          {label}
        </Text>
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
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111', letterSpacing: -0.3 },
  headerSub: { marginTop: 4, fontSize: 14, color: '#6b7280', lineHeight: 20 },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 0,
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
    minHeight: 54,
    gap: 4,
    paddingHorizontal: 2,
  },
  topTabIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topTabText: { fontSize: 11, fontWeight: '600' },
  topTabTextActive: { fontWeight: '800' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '800' },
  tabUnderline: { height: 3, width: '72%', borderRadius: 999, marginTop: 4 },
  listContent: { padding: 16, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHead: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  typeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadType: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  levelChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  levelChipText: { fontSize: 11, fontWeight: '700' },
  cardBody: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  cardIdentity: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.10)',
    marginTop: 2,
  },
  cardIdentityText: { flex: 1, minWidth: 0 },
  rolePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 2,
  },
  rolePillText: { fontSize: 11, fontWeight: '800' },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
    color: '#111',
  },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 },
  metaRow: { flexDirection: 'column', gap: 6, marginTop: 12 },
  metaInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaInlineText: { fontSize: 13, fontWeight: '600', flex: 1 },
  chatPreview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  chatPreviewText: { flex: 1, fontSize: 13, lineHeight: 18 },
  cardPlayersWrap: { marginTop: 12 },
  cuposRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cuposLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  cuposValue: { fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerSpacer: { flex: 1 },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusChipText: { fontSize: 11, fontWeight: '800' },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 118,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  detailBtnText: { fontSize: 14, fontWeight: '800' },
  detailBtnIcon: { marginTop: 1 },
  invitationActions: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  invitationBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  invitationAcceptBtn: {
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    borderColor: 'rgba(22, 163, 74, 0.35)',
  },
  invitationRejectBtn: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.3)',
  },
  invitationAcceptText: {
    color: '#166534',
    fontWeight: '800',
    fontSize: 14,
  },
  invitationRejectText: {
    color: '#991b1b',
    fontWeight: '800',
    fontSize: 14,
  },
  invitationBtnDisabled: {
    opacity: 0.5,
  },
  emptyCard: {
    marginTop: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCardSub: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  emptyCta: {
    marginTop: 18,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  emptyCtaText: { fontSize: 15, fontWeight: '800' },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
})
