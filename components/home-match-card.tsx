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
  /** Tema oscuro (inicio jugador). */
  dark?: boolean
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
  sheet: typeof styles | typeof darkStyles
) {
  if (t === 'rival') return sheet.headerRival
  if (t === 'players') return sheet.headerPlayers
  if (isTeamPickType(t)) return sheet.headerTeamPick
  return sheet.headerOpen
}

function headerTextStyle(
  t: MatchType,
  sheet: typeof styles | typeof darkStyles
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
  sheet: typeof styles | typeof darkStyles
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
  dark = false,
}: Props) {
  const s = dark ? darkStyles : styles
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
                <ActivityIndicator color="#fff" size="small" />
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

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerRival: { backgroundColor: 'rgba(220, 38, 38, 0.08)' },
  headerPlayers: { backgroundColor: 'rgba(37, 99, 235, 0.08)' },
  headerOpen: { backgroundColor: 'rgba(8, 145, 178, 0.08)' },
  headerTeamPick: { backgroundColor: 'rgba(22, 163, 74, 0.1)' },
  typeBadgeText: { fontSize: 14, fontWeight: '700' },
  typeTextRival: { color: '#b91c1c' },
  typeTextPlayers: { color: '#1d4ed8' },
  typeTextOpen: { color: '#0e7490' },
  typeTextTeamPick: { color: '#15803d' },
  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  levelPillText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  body: { padding: 14 },
  title: { fontSize: 17, fontWeight: '700', color: '#111' },
  muted: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  desc: { fontSize: 14, color: '#6b7280', marginTop: 6 },
  metaBlock: { marginTop: 12, gap: 6 },
  meta: { fontSize: 14, color: '#4b5563' },
  smallMuted: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  playersHint: { marginTop: 4 },
  playersSeek: { fontSize: 12, color: '#374151', marginTop: 4 },
  progressRow: { marginTop: 4 },
  progressTrack: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  shareRow: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  shareText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  footer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  organizer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
  },
  orgName: { fontSize: 14, fontWeight: '600', color: '#111' },
  orgLabel: { fontSize: 12, color: '#6b7280' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  link: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  btnRival: { backgroundColor: '#dc2626' },
  btnPlayers: { backgroundColor: '#2563eb' },
  btnOpen: { backgroundColor: '#0891b2' },
  btnTeamPick: { backgroundColor: '#16a34a' },
  btnMuted: { backgroundColor: '#e5e7eb' },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionBtnTextMuted: { color: '#6b7280' },
})

const darkStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C3131',
    backgroundColor: '#141717',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C3131',
  },
  headerRival: { backgroundColor: 'rgba(220, 38, 38, 0.15)' },
  headerPlayers: { backgroundColor: 'rgba(116, 212, 93, 0.12)' },
  headerOpen: { backgroundColor: 'rgba(251, 146, 60, 0.12)' },
  headerTeamPick: { backgroundColor: 'rgba(116, 212, 93, 0.14)' },
  typeBadgeText: { fontSize: 14, fontWeight: '700' },
  typeTextRival: { color: '#fca5a5' },
  typeTextPlayers: { color: '#86efac' },
  typeTextOpen: { color: '#fdba74' },
  typeTextTeamPick: { color: '#86efac' },
  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C3131',
    backgroundColor: '#1C2020',
  },
  levelPillText: { fontSize: 12, fontWeight: '600', color: '#F5F7F7' },
  body: { padding: 14 },
  title: { fontSize: 17, fontWeight: '700', color: '#F5F7F7' },
  muted: { fontSize: 14, color: '#9CA3A3', marginTop: 4 },
  desc: { fontSize: 14, color: '#9CA3A3', marginTop: 6 },
  metaBlock: { marginTop: 12, gap: 6 },
  meta: { fontSize: 14, color: '#d1d5db' },
  smallMuted: { fontSize: 12, color: '#9CA3A3', marginTop: 4 },
  playersHint: { marginTop: 4 },
  playersSeek: { fontSize: 12, color: '#d1d5db', marginTop: 4 },
  progressRow: { marginTop: 4 },
  progressTrack: {
    height: 6,
    backgroundColor: '#2C3131',
    borderRadius: 4,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0F4539',
    borderRadius: 4,
  },
  shareRow: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C3131',
    backgroundColor: '#1C2020',
  },
  shareText: { fontSize: 14, fontWeight: '600', color: '#86efac' },
  footer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2C3131',
  },
  organizer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2C3131',
  },
  orgName: { fontSize: 14, fontWeight: '600', color: '#F5F7F7' },
  orgLabel: { fontSize: 12, color: '#9CA3A3' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  link: { fontSize: 14, fontWeight: '600', color: '#86efac' },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  btnRival: { backgroundColor: '#dc2626' },
  btnPlayers: { backgroundColor: '#22c55e' },
  btnOpen: { backgroundColor: '#ea580c' },
  btnTeamPick: { backgroundColor: '#0F4539' },
  btnMuted: { backgroundColor: '#2C3131' },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionBtnTextMuted: { color: '#9CA3A3' },
})
