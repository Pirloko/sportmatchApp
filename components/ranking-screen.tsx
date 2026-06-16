import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { formatRelativePast } from '../lib/format-relative-past'
import { levelLabel } from '../lib/format-match'
import { useApp } from '../lib/app-provider'
import {
  buildPlayerRankingRows,
  buildTeamRankingRows,
  type PlayerRankingRow,
  type TeamRankingRow,
} from '../lib/ranking'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import { fetchLastPlayedMaps } from '../lib/supabase/ranking-queries'
import { fetchPlayerMvpWinsCountsBatch } from '../lib/supabase/mvp-queries'
import { useThemePreference } from '../lib/theme-context'
import { useScreenTheme } from '../lib/theme-ui'
import { BallLoadingIndicator } from './ball-loading-indicator'

type Tab = 'players' | 'teams'

const LEVEL_LABELS: Record<string, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

type PodiumStyle = {
  cardBg: string
  borderColor: string
  borderWidth: number
  badgeBg: string
  badgeBorder: string
  rankColor: string
}

function podiumStyleForRank(rank: number, isDark: boolean): PodiumStyle | null {
  if (rank === 1) {
    return isDark
      ? {
          cardBg: 'rgba(251, 191, 36, 0.12)',
          borderColor: '#FBBF24',
          borderWidth: 2,
          badgeBg: 'rgba(251, 191, 36, 0.28)',
          badgeBorder: '#FBBF24',
          rankColor: '#FDE68A',
        }
      : {
          cardBg: 'rgba(245, 158, 11, 0.1)',
          borderColor: '#D97706',
          borderWidth: 2,
          badgeBg: 'rgba(245, 158, 11, 0.22)',
          badgeBorder: '#D97706',
          rankColor: '#B45309',
        }
  }
  if (rank === 2) {
    return isDark
      ? {
          cardBg: 'rgba(203, 213, 225, 0.1)',
          borderColor: '#94A3B8',
          borderWidth: 2,
          badgeBg: 'rgba(203, 213, 225, 0.22)',
          badgeBorder: '#94A3B8',
          rankColor: '#E2E8F0',
        }
      : {
          cardBg: 'rgba(148, 163, 184, 0.12)',
          borderColor: '#64748B',
          borderWidth: 2,
          badgeBg: 'rgba(148, 163, 184, 0.2)',
          badgeBorder: '#64748B',
          rankColor: '#475569',
        }
  }
  if (rank === 3) {
    return isDark
      ? {
          cardBg: 'rgba(217, 119, 6, 0.1)',
          borderColor: '#D97706',
          borderWidth: 2,
          badgeBg: 'rgba(217, 119, 6, 0.22)',
          badgeBorder: '#EA580C',
          rankColor: '#FDBA74',
        }
      : {
          cardBg: 'rgba(234, 88, 12, 0.08)',
          borderColor: '#EA580C',
          borderWidth: 2,
          badgeBg: 'rgba(234, 88, 12, 0.16)',
          badgeBorder: '#EA580C',
          rankColor: '#C2410C',
        }
  }
  return null
}

function RankBadge({
  rank,
  podium,
  fallbackBadgeBg,
  fallbackBorder,
  fallbackRankColor,
}: {
  rank: number
  podium: PodiumStyle | null
  fallbackBadgeBg: string
  fallbackBorder: string
  fallbackRankColor: string
}) {
  return (
    <View
      style={[
        styles.rankBadge,
        {
          backgroundColor: podium?.badgeBg ?? fallbackBadgeBg,
          borderColor: podium?.badgeBorder ?? fallbackBorder,
          borderWidth: podium ? 2 : 1,
        },
      ]}
    >
      <Text style={[styles.rankNum, { color: podium?.rankColor ?? fallbackRankColor }]}>
        {rank}
      </Text>
    </View>
  )
}

export function RankingScreen() {
  const { currentUser, getFilteredUsers, getFilteredTeams } = useApp()
  const theme = useScreenTheme()
  const { resolved, tokens } = useThemePreference()
  const [tab, setTab] = useState<Tab>('players')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [playerLastAt, setPlayerLastAt] = useState<Map<string, Date>>(new Map())
  const [teamLastAt, setTeamLastAt] = useState<Map<string, Date>>(new Map())
  const [playerMvpCounts, setPlayerMvpCounts] = useState<Map<string, number>>(new Map())

  const ui = useMemo(
    () => ({
      statWinBg: theme.statWinBg,
      statDrawBg: theme.statDrawBg,
      statLossBg: theme.statLossBg,
      statMvpBg: theme.isDark ? 'rgba(253, 224, 71, 0.14)' : '#FEFCE8',
      logoBoxBg: theme.logoBoxBg,
      logoBoxBorder: theme.logoBoxBorder,
      tabInactiveBg: theme.tabInactive,
      primaryAccent: theme.primaryAccent,
      accentOnSurface: theme.accentOnSurface,
      dangerOnSurface: theme.dangerOnSurface,
    }),
    [theme]
  )

  const loadPlayerMvpCounts = useCallback(async (userIds: string[]) => {
    if (!isSupabaseConfigured() || userIds.length === 0) {
      setPlayerMvpCounts(new Map())
      return
    }
    const supabase = getSupabase()
    const map = await fetchPlayerMvpWinsCountsBatch(supabase, userIds)
    setPlayerMvpCounts(map)
  }, [])

  const loadLastPlayed = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setPlayerLastAt(new Map())
      setTeamLastAt(new Map())
      return
    }
    const supabase = getSupabase()
    const maps = await fetchLastPlayedMaps(supabase)
    setPlayerLastAt(maps.playerLastAt)
    setTeamLastAt(maps.teamLastAt)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      await loadLastPlayed()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [loadLastPlayed])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadLastPlayed()
    if (currentUser) {
      const ids = buildPlayerRankingRows(
        currentUser,
        getFilteredUsers(currentUser.gender),
        playerLastAt
      ).map((r) => r.id)
      await loadPlayerMvpCounts(ids)
    }
    setRefreshing(false)
  }, [loadLastPlayed, loadPlayerMvpCounts, currentUser, getFilteredUsers, playerLastAt])

  const playerRowsBase = useMemo(() => {
    if (!currentUser) return []
    return buildPlayerRankingRows(
      currentUser,
      getFilteredUsers(currentUser.gender),
      playerLastAt
    )
  }, [currentUser, getFilteredUsers, playerLastAt])

  useEffect(() => {
    void loadPlayerMvpCounts(playerRowsBase.map((r) => r.id))
  }, [playerRowsBase, loadPlayerMvpCounts])

  const playerRows = useMemo(
    () =>
      playerRowsBase.map((row) => ({
        ...row,
        mvpWins: playerMvpCounts.get(row.id) ?? 0,
      })),
    [playerRowsBase, playerMvpCounts]
  )

  const teamRows = useMemo(() => {
    if (!currentUser) return []
    return buildTeamRankingRows(
      currentUser,
      getFilteredTeams(currentUser.gender),
      teamLastAt
    )
  }, [currentUser, getFilteredTeams, teamLastAt])

  const renderPlayerRow: ListRenderItem<PlayerRankingRow> = useCallback(
    ({ item, index }) => {
      const rank = index + 1
      const podium = podiumStyleForRank(rank, resolved === 'dark')
      const borderColor = item.isCurrentUser
        ? theme.primary
        : podium?.borderColor ?? tokens.borderDark
      return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: podium?.cardBg ?? tokens.cardDark,
            borderColor,
            borderWidth: podium || item.isCurrentUser ? 2 : 1,
          },
          item.isCurrentUser && !podium && styles.cardHighlight,
        ]}
      >
        <View style={styles.cardTop}>
          <RankBadge
            rank={rank}
            podium={podium}
            fallbackBadgeBg={ui.logoBoxBg}
            fallbackBorder={ui.logoBoxBorder}
            fallbackRankColor={ui.primaryAccent}
          />
          <Image source={{ uri: item.photo }} style={styles.avatar} />
          <View style={styles.cardMid}>
            <Text
              style={[styles.name, { color: tokens.textPrimary }]}
              numberOfLines={1}
            >
              {item.name}
              {item.isCurrentUser ? ' (tú)' : ''}
            </Text>
            <Text style={[styles.meta, { color: tokens.textMuted }]}>
              {LEVEL_LABELS[item.level] ?? levelLabel(item.level)} · {item.city}
            </Text>
            <Text style={[styles.lastPlayed, { color: tokens.textMuted }]}>
              {item.lastPlayedAt
                ? `Último partido ${formatRelativePast(item.lastPlayedAt)}`
                : 'Sin partidos registrados'}
            </Text>
          </View>
          <View style={styles.playedPill}>
            <Text style={[styles.playedNum, { color: tokens.textPrimary }]}>
              {item.played}
            </Text>
            <Text style={[styles.playedLabel, { color: tokens.textMuted }]}>
              PJ
            </Text>
          </View>
        </View>

        <View style={styles.recordRow}>
          <StatCell
            icon="trophy"
            iconColor={ui.primaryAccent}
            value={item.wins}
            label="V"
            pct={item.winPct}
            bg={ui.statWinBg}
            text={tokens.textPrimary}
            muted={tokens.textMuted}
          />
          <StatCell
            icon="remove-outline"
            iconColor={ui.accentOnSurface}
            value={item.draws}
            label="E"
            pct={item.drawPct}
            bg={ui.statDrawBg}
            text={tokens.textPrimary}
            muted={tokens.textMuted}
          />
          <StatCell
            icon="trending-down-outline"
            iconColor={ui.dangerOnSurface}
            value={item.losses}
            label="D"
            pct={item.lossPct}
            bg={ui.statLossBg}
            text={tokens.textPrimary}
            muted={tokens.textMuted}
          />
          <StatCell
            icon="star"
            iconColor={ui.accentOnSurface}
            value={item.mvpWins}
            label="MVP"
            bg={ui.statMvpBg}
            text={tokens.textPrimary}
            muted={tokens.textMuted}
          />
        </View>
      </View>
      )
    },
    [tokens, ui, resolved, theme.primary]
  )

  const renderTeamRow: ListRenderItem<TeamRankingRow> = useCallback(
    ({ item, index }) => {
      const rank = index + 1
      const podium = podiumStyleForRank(rank, resolved === 'dark')
      return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: podium?.cardBg ?? tokens.cardDark,
            borderColor: podium?.borderColor ?? tokens.borderDark,
            borderWidth: podium ? 2 : 1,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <RankBadge
            rank={rank}
            podium={podium}
            fallbackBadgeBg={ui.logoBoxBg}
            fallbackBorder={ui.logoBoxBorder}
            fallbackRankColor={ui.primaryAccent}
          />
          <View
            style={[
              styles.teamLogo,
              {
                backgroundColor: ui.logoBoxBg,
                borderWidth: 1,
                borderColor: ui.logoBoxBorder,
              },
            ]}
          >
            {item.logo ? (
              <Image
                source={{ uri: item.logo }}
                style={styles.teamLogoImg}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="shield" size={24} color={ui.primaryAccent} />
            )}
          </View>
          <View style={styles.cardMid}>
            <Text
              style={[styles.name, { color: tokens.textPrimary }]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            <Text style={[styles.meta, { color: tokens.textMuted }]}>
              {LEVEL_LABELS[item.level] ?? levelLabel(item.level)} · {item.city}
            </Text>
            <Text style={[styles.lastPlayed, { color: tokens.textMuted }]}>
              {item.lastPlayedAt
                ? `Último partido ${formatRelativePast(item.lastPlayedAt)}`
                : 'Sin partidos rival'}
            </Text>
          </View>
          <View style={styles.playedPill}>
            <Text style={[styles.playedNum, { color: tokens.textPrimary }]}>
              {item.played}
            </Text>
            <Text style={[styles.playedLabel, { color: tokens.textMuted }]}>
              PJ
            </Text>
          </View>
        </View>

        <View style={styles.recordRow}>
          <StatCell
            icon="trophy"
            iconColor={ui.primaryAccent}
            value={item.wins}
            label="V"
            pct={item.winPct}
            bg={ui.statWinBg}
            text={tokens.textPrimary}
            muted={tokens.textMuted}
          />
          <StatCell
            icon="remove-outline"
            iconColor={ui.accentOnSurface}
            value={item.draws}
            label="E"
            pct={item.drawPct}
            bg={ui.statDrawBg}
            text={tokens.textPrimary}
            muted={tokens.textMuted}
          />
          <StatCell
            icon="trending-down-outline"
            iconColor={ui.dangerOnSurface}
            value={item.losses}
            label="D"
            pct={item.lossPct}
            bg={ui.statLossBg}
            text={tokens.textPrimary}
            muted={tokens.textMuted}
          />
        </View>
      </View>
      )
    },
    [tokens, ui, resolved]
  )

  const listEmpty = (
    <View style={styles.empty}>
      <Ionicons
        name={tab === 'players' ? 'people-outline' : 'shield-outline'}
        size={40}
        color={tokens.textMuted}
      />
      <Text style={[styles.emptyText, { color: tokens.textMuted }]}>
        {tab === 'players'
          ? 'Aún no hay jugadores con partidos en tu región.'
          : 'Aún no hay equipos con partidos rival en tu región.'}
      </Text>
    </View>
  )

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      tintColor={theme.primary}
    />
  )

  if (!currentUser || currentUser.accountType !== 'player') {
    return (
      <View style={styles.center}>
        <Text style={{ color: tokens.textMuted }}>Solo jugadores.</Text>
      </View>
    )
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: tokens.bgDark }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: tokens.borderDark }]}>
        <Text style={[styles.eyebrow, { color: tokens.textMuted }]}>RANKING</Text>
        <Text style={[styles.title, { color: tokens.textPrimary }]}>
          Clasificación
        </Text>
        <Text style={[styles.subtitle, { color: tokens.textMuted }]}>
          Top 10 en tu región · partidos jugados y récord
        </Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          style={[
            styles.tabBtn,
            {
              backgroundColor: tab === 'players' ? theme.primary : ui.tabInactiveBg,
            },
          ]}
          onPress={() => setTab('players')}
        >
          <Ionicons
            name="person-outline"
            size={16}
            color={tab === 'players' ? theme.primaryBtnText : tokens.textMuted}
          />
          <Text
            style={[
              styles.tabBtnText,
              { color: tab === 'players' ? theme.primaryBtnText : tokens.textMuted },
            ]}
          >
            Jugadores
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.tabBtn,
            {
              backgroundColor: tab === 'teams' ? theme.primary : ui.tabInactiveBg,
            },
          ]}
          onPress={() => setTab('teams')}
        >
          <Ionicons
            name="shield-outline"
            size={16}
            color={tab === 'teams' ? theme.primaryBtnText : tokens.textMuted}
          />
          <Text
            style={[
              styles.tabBtnText,
              { color: tab === 'teams' ? theme.primaryBtnText : tokens.textMuted },
            ]}
          >
            Equipos
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <BallLoadingIndicator fullScreen size="lg" />
      ) : tab === 'players' ? (
        <FlatList
          data={playerRows}
          keyExtractor={(item) => item.id}
          renderItem={renderPlayerRow}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
          ListEmptyComponent={listEmpty}
        />
      ) : (
        <FlatList
          data={teamRows}
          keyExtractor={(item) => item.id}
          renderItem={renderTeamRow}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
          ListEmptyComponent={listEmpty}
        />
      )}
    </SafeAreaView>
  )
}

function StatCell({
  icon,
  iconColor,
  value,
  label,
  pct,
  subLabel,
  bg,
  text,
  muted,
}: {
  icon: ComponentProps<typeof Ionicons>['name']
  iconColor: string
  value: number
  label: string
  pct?: number
  subLabel?: string
  bg: string
  text: string
  muted: string
}) {
  return (
    <View style={[styles.statCell, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text style={[styles.statValue, { color: text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
      {pct != null ? (
        <Text style={[styles.statPct, { color: iconColor }]}>{pct}%</Text>
      ) : subLabel ? (
        <Text style={[styles.statPct, { color: iconColor }]}>{subLabel}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHighlight: {
    borderWidth: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontSize: 14,
    fontWeight: '800',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  teamLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  teamLogoImg: {
    width: 44,
    height: 44,
  },
  cardMid: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    marginTop: 2,
  },
  lastPlayed: {
    fontSize: 11,
    marginTop: 4,
  },
  playedPill: {
    alignItems: 'center',
    minWidth: 36,
  },
  playedNum: {
    fontSize: 18,
    fontWeight: '800',
  },
  playedLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  recordRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCell: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statPct: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
})
