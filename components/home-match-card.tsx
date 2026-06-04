import { useMemo } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  formatMatchClock,
  formatMatchWeekdayDate,
  levelLabel,
  matchTypeHomeLabel,
} from '../lib/format-match'
import { playersSeekProfileLabel } from '../lib/players-seek-profile'
import { useScreenTheme } from '../lib/theme-ui'
import type { MatchOpportunity, MatchType } from '../lib/types'

function isTeamPickType(type: MatchType): boolean {
  return (
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

type Props = {
  match: MatchOpportunity
  isOwn?: boolean
  isJoined?: boolean
  joining?: boolean
  onViewDetails?: () => void
  onJoin?: () => void | Promise<void>
  currentUserId?: string
  onShareRevuelta?: () => void
}

function actionLabel(type: MatchType, isOwn: boolean, isJoined: boolean): string {
  if (isOwn) return 'Gestionar'
  if (isJoined) return 'Te uniste'
  if (type === 'rival') return 'Desafiar'
  if (type === 'players') return 'Postular'
  return 'Unirse'
}

function headerStyle(
  t: MatchType,
  sheet: ReturnType<typeof createCardStyles>
) {
  if (t === 'rival') return sheet.headerRival
  if (t === 'players') return sheet.headerPlayers
  if (isTeamPickType(t)) return sheet.headerTeamPick
  return sheet.headerOpen
}

function headerTextStyle(
  t: MatchType,
  sheet: ReturnType<typeof createCardStyles>
) {
  if (t === 'rival') return sheet.typeTextRival
  if (t === 'players') return sheet.typeTextPlayers
  if (isTeamPickType(t)) return sheet.typeTextTeamPick
  return sheet.typeTextOpen
}

function btnBg(
  t: MatchType,
  isJoined: boolean,
  isOwn: boolean,
  sheet: ReturnType<typeof createCardStyles>
) {
  if (isJoined && !isOwn) return sheet.btnMuted
  if (t === 'rival') return sheet.btnRival
  if (t === 'players') return sheet.btnPlayers
  if (isTeamPickType(t)) return sheet.btnTeamPick
  return sheet.btnOpen
}

export function HomeMatchCard({
  match,
  isOwn = false,
  isJoined = false,
  joining = false,
  onViewDetails,
  onJoin,
  currentUserId,
  onShareRevuelta,
}: Props) {
  const theme = useScreenTheme()
  const s = useMemo(() => createCardStyles(theme), [theme])
  const actionDisabled = joining || (isJoined && !isOwn)
  const label = actionLabel(match.type, isOwn, isJoined)
  const showRevueltaShare =
    match.type === 'open' &&
    currentUserId &&
    (match.creatorId === currentUserId || isJoined) &&
    onShareRevuelta

  const progress =
    match.playersNeeded && match.playersNeeded > 0
      ? Math.min(
          100,
          ((match.playersJoined ?? 0) / match.playersNeeded) * 100
        )
      : 0

  return (
    <View style={s.card}>
      <View style={[s.cardHeader, headerStyle(match.type, s)]}>
        <Text style={[s.typeBadgeText, headerTextStyle(match.type, s)]}>
          {matchTypeHomeLabel(match.type)}
        </Text>
        <View style={s.levelPill}>
          <Text style={s.levelPillText}>{levelLabel(match.level)}</Text>
        </View>
      </View>

      <View style={s.body}>
        <Text style={s.title}>{match.title}</Text>
        {match.teamName ? (
          <Text style={s.muted}>{match.teamName}</Text>
        ) : null}
        {match.description ? (
          <Text style={s.desc} numberOfLines={2}>
            {match.description}
          </Text>
        ) : null}

        <View style={s.metaBlock}>
          <Text style={s.meta}>
            📅 {formatMatchWeekdayDate(match.dateTime)}
          </Text>
          <Text style={s.meta}>🕐 {formatMatchClock(match.dateTime)}</Text>
          <Text style={s.meta}>
            📍 {match.venue}, {match.location}
          </Text>
          {match.playersNeeded != null ? (
            <View style={s.progressRow}>
              <Text style={s.meta}>
                👥 {match.playersJoined ?? 0}/{match.playersNeeded} jugadores
              </Text>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${progress}%` }]} />
              </View>
            </View>
          ) : null}
          {match.type === 'open' && match.playersNeeded != null ? (
            <Text style={s.smallMuted}>
              Cupos disponibles:{' '}
              {Math.max(
                0,
                match.playersNeeded - (match.playersJoined ?? 0)
              )}{' '}
              · Total en cancha (organizador incluido).
            </Text>
          ) : null}
          {match.type === 'players' ? (
            <View style={s.playersHint}>
              <Text style={s.smallMuted}>
                Cupos solo para quienes se suman (el organizador no cuenta).
              </Text>
              {playersSeekProfileLabel(match.playersSeekProfile) ? (
                <Text style={s.playersSeek}>
                  {playersSeekProfileLabel(match.playersSeekProfile)}
                  {match.playersSeekProfile === 'gk_and_field'
                    ? ' · máx. 1 arquero'
                    : ''}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {showRevueltaShare ? (
          <Pressable style={s.shareRow} onPress={onShareRevuelta}>
            <Text style={s.shareText}>Compartir revuelta</Text>
          </Pressable>
        ) : null}

        <View style={s.footer}>
          <View style={s.organizer}>
            <Image
              source={{ uri: match.creatorPhoto }}
              style={s.avatar}
            />
            <View>
              <Text style={s.orgName}>{match.creatorName}</Text>
              <Text style={s.orgLabel}>Organizador</Text>
            </View>
          </View>
          <View style={s.actions}>
            <Pressable onPress={onViewDetails} hitSlop={8}>
              <Text style={s.link}>Ver detalle</Text>
            </Pressable>
            <Pressable
              style={[
                s.actionBtn,
                btnBg(match.type, isJoined, isOwn, s),
                actionDisabled && s.actionBtnDisabled,
              ]}
              disabled={actionDisabled}
              onPress={() => void onJoin?.()}
            >
              {joining ? (
                <ActivityIndicator color={theme.primaryBtnText} size="small" />
              ) : (
                <Text
                  style={[
                    s.actionBtnText,
                    isJoined && !isOwn && s.actionBtnTextMuted,
                  ]}
                >
                  {label}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

function createCardStyles(theme: ReturnType<typeof useScreenTheme>) {
  const { tokens, isDark } = theme
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    headerRival: {
      backgroundColor: isDark
        ? 'rgba(239, 68, 68, 0.15)'
        : 'rgba(220, 38, 38, 0.08)',
    },
    headerPlayers: {
      backgroundColor: isDark
        ? 'rgba(15, 69, 57, 0.2)'
        : 'rgba(15, 69, 57, 0.08)',
    },
    headerOpen: {
      backgroundColor: isDark
        ? 'rgba(245, 158, 11, 0.12)'
        : 'rgba(217, 123, 53, 0.1)',
    },
    headerTeamPick: {
      backgroundColor: isDark
        ? 'rgba(34, 197, 94, 0.14)'
        : 'rgba(22, 163, 74, 0.1)',
    },
    typeBadgeText: { fontSize: 14, fontWeight: '700' },
    typeTextRival: { color: tokens.destructive },
    typeTextPlayers: { color: isDark ? tokens.success : theme.primary },
    typeTextOpen: { color: tokens.accent },
    typeTextTeamPick: { color: tokens.success },
    levelPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: isDark ? theme.cardElevated : theme.card,
    },
    levelPillText: { fontSize: 12, fontWeight: '600', color: theme.text },
    body: { padding: 14 },
    title: { fontSize: 17, fontWeight: '700', color: theme.text },
    muted: { fontSize: 14, color: theme.textMuted, marginTop: 4 },
    desc: { fontSize: 14, color: theme.textMuted, marginTop: 6 },
    metaBlock: { marginTop: 12, gap: 6 },
    meta: { fontSize: 14, color: theme.textMuted },
    smallMuted: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
    playersHint: { marginTop: 4 },
    playersSeek: { fontSize: 12, color: theme.text, marginTop: 4 },
    progressRow: { marginTop: 4 },
    progressTrack: {
      height: 6,
      backgroundColor: theme.border,
      borderRadius: 4,
      marginTop: 6,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: isDark ? theme.accent : theme.primary,
      borderRadius: 4,
    },
    shareRow: {
      marginTop: 12,
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: isDark ? theme.cardElevated : theme.card,
    },
    shareText: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? tokens.success : theme.link,
    },
    footer: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    organizer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.border,
    },
    orgName: { fontSize: 14, fontWeight: '600', color: theme.text },
    orgLabel: { fontSize: 12, color: theme.textMuted },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      gap: 10,
    },
    link: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? tokens.success : theme.link,
    },
    actionBtn: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      minWidth: 112,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionBtnDisabled: { opacity: 0.5 },
    btnRival: { backgroundColor: tokens.destructive },
    btnPlayers: { backgroundColor: isDark ? tokens.success : theme.primary },
    btnOpen: { backgroundColor: tokens.accent },
    btnTeamPick: { backgroundColor: isDark ? theme.accent : tokens.success },
    btnMuted: { backgroundColor: theme.border },
    actionBtnText: {
      color: theme.primaryBtnText,
      fontSize: 14,
      fontWeight: '700',
    },
    actionBtnTextMuted: { color: theme.textMuted },
  })
}
