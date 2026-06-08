import { forwardRef } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

const SPORTMATCH_LOGO = require('../assets/sportmatch-logo.png')

export type ProfileShareTeamEntry = {
  id: string
  name: string
  logoUri: string | null
  roleLine: string
}

export type ProfileShareCardData = {
  name: string
  photoUri: string
  playerWins: number
  playerDraws: number
  playerLosses: number
  mvpWins: number
  yellowCards: number
  redCards: number
  teams: ProfileShareTeamEntry[]
}

type Props = {
  data: ProfileShareCardData
}

const CARD_W = 360
const CARD_H = 640
const PAD = 18
const STAT_GAP = 7
const STAT_W = (CARD_W - PAD * 2 - STAT_GAP) / 2

const STATS: Array<{
  key: keyof Pick<
    ProfileShareCardData,
    'playerWins' | 'playerDraws' | 'playerLosses' | 'mvpWins'
  >
  full: string
  emoji: string
  accent: string
  bg: string
}> = [
  { key: 'playerWins', full: 'Victorias', emoji: '🏆', accent: '#4ade80', bg: 'rgba(34,197,94,0.18)' },
  { key: 'playerDraws', full: 'Empates', emoji: '🤝', accent: '#fbbf24', bg: 'rgba(251,191,36,0.16)' },
  { key: 'playerLosses', full: 'Derrotas', emoji: '📉', accent: '#f87171', bg: 'rgba(239,68,68,0.16)' },
  { key: 'mvpWins', full: 'MVP', emoji: '⭐', accent: '#fde047', bg: 'rgba(253,224,71,0.2)' },
]

/** Tarjeta 9:16 — layout fijo; equipos siempre visibles. */
export const ProfileShareCard = forwardRef<View, Props>(function ProfileShareCard(
  { data },
  ref
) {
  const teamCount = data.teams.length
  const visibleTeams = data.teams.slice(0, teamCount <= 2 ? teamCount : 2)
  const extraTeams = data.teams.length - visibleTeams.length
  const singleTeam = teamCount === 1 ? data.teams[0] : null

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      <View style={styles.bgTop} />
      <View style={styles.bgBottom} />

      {/* ── Cabecera compacta ── */}
      <View style={styles.headerRow}>
        <View style={styles.logoWrap}>
          <Image source={SPORTMATCH_LOGO} style={styles.logo} resizeMode="contain" />
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.brandName}>SportMatch</Text>
          <Text style={styles.kicker}>Mi ficha de jugador</Text>
        </View>
      </View>

      {/* ── Jugador ── */}
      <View style={styles.playerRow}>
        <View style={styles.avatarOuter}>
          <Image source={{ uri: data.photoUri }} style={styles.avatar} />
        </View>
        <Text style={styles.playerName} numberOfLines={2}>
          {data.name}
        </Text>
      </View>

      {/* ── Stats 3×2 compacto ── */}
      <View style={styles.statsBlock}>
        <Text style={styles.sectionLabel}>Rendimiento</Text>
        <View style={styles.statsGrid}>
          {STATS.map((s) => (
            <View
              key={s.key}
              style={[
                styles.statCell,
                { backgroundColor: s.bg },
                s.key === 'mvpWins' && styles.statCellMvp,
              ]}
            >
              <Text style={styles.statEmoji}>{s.emoji}</Text>
              <Text style={[styles.statNum, { color: s.accent }]}>{data[s.key]}</Text>
              <Text style={styles.statTag}>{s.full}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Equipos: ocupa el espacio restante ── */}
      <View style={styles.teamsBlock}>
        <Text style={styles.sectionLabel}>Mis equipos</Text>
        <View style={[styles.teamsBody, teamCount <= 1 && styles.teamsBodySingle]}>
          {teamCount === 0 ? (
            <Text style={styles.teamsEmpty}>Sin equipos aún</Text>
          ) : singleTeam ? (
            <View style={styles.teamHero}>
              <View style={styles.teamHeroAccent} />
              {singleTeam.logoUri ? (
                <Image source={{ uri: singleTeam.logoUri }} style={styles.teamHeroLogo} />
              ) : (
                <View style={styles.teamHeroLogoFallback}>
                  <Text style={styles.teamHeroInitial}>
                    {teamInitial(singleTeam.name)}
                  </Text>
                </View>
              )}
              <View style={styles.teamHeroMeta}>
                <Text style={styles.teamHeroName} numberOfLines={2}>
                  {singleTeam.name}
                </Text>
                <Text style={styles.teamHeroRole} numberOfLines={2}>
                  {singleTeam.roleLine}
                </Text>
              </View>
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>ACTIVO</Text>
              </View>
            </View>
          ) : (
            <View style={styles.teamsList}>
              {visibleTeams.map((team) => (
                <TeamRow key={team.id} team={team} compact />
              ))}
              {extraTeams > 0 ? (
                <Text style={styles.teamsMore}>+{extraTeams} equipos más</Text>
              ) : null}
            </View>
          )}
        </View>
      </View>

      <Text style={styles.footer}>sportmatch.cl</Text>
    </View>
  )
})

function TeamRow({ team, compact }: { team: ProfileShareTeamEntry; compact?: boolean }) {
  return (
    <View style={[styles.teamRow, compact && styles.teamRowCompact]}>
      {team.logoUri ? (
        <Image source={{ uri: team.logoUri }} style={styles.teamRowLogo} />
      ) : (
        <View style={styles.teamRowLogoFallback}>
          <Text style={styles.teamRowInitial}>{teamInitial(team.name)}</Text>
        </View>
      )}
      <View style={styles.teamRowMeta}>
        <Text style={styles.teamRowName} numberOfLines={1}>
          {team.name}
        </Text>
        <Text style={styles.teamRowRole} numberOfLines={1}>
          {team.roleLine}
        </Text>
      </View>
      <View style={styles.activePillSmall}>
        <Text style={styles.activePillTextSmall}>ACTIVO</Text>
      </View>
    </View>
  )
}

function teamInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    flexDirection: 'column',
    backgroundColor: '#051510',
    borderRadius: 22,
    paddingHorizontal: PAD,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.15)',
  },
  bgTop: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  bgBottom: {
    position: 'absolute',
    bottom: 60,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    zIndex: 1,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  logo: { width: 38, height: 38 },
  headerTextCol: { flex: 1 },
  brandName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  kicker: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
    zIndex: 1,
  },
  avatarOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(74, 222, 128, 0.6)',
    padding: 2,
    backgroundColor: '#051510',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  playerName: {
    flex: 1,
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 28,
  },

  statsBlock: {
    marginBottom: 12,
    zIndex: 1,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: STAT_GAP,
  },
  statCell: {
    width: STAT_W,
    height: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statCellMvp: {
    borderColor: 'rgba(253, 224, 71, 0.45)',
  },
  statEmoji: { fontSize: 11, lineHeight: 13 },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 1,
  },
  statTag: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 1,
  },

  teamsBlock: {
    flex: 1,
    zIndex: 1,
    minHeight: 120,
  },
  teamsBody: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  teamsBodySingle: {
    justifyContent: 'center',
  },
  teamsEmpty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    paddingVertical: 20,
  },

  teamHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    paddingLeft: 18,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
    overflow: 'hidden',
    minHeight: 96,
  },
  teamHeroAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#22c55e',
  },
  teamHeroLogo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  teamHeroLogoFallback: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  teamHeroInitial: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  teamHeroMeta: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  teamHeroName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  teamHeroRole: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 16,
  },
  activePill: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  activePillText: {
    color: '#86efac',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  teamsList: { gap: 8 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  teamRowCompact: {
    paddingVertical: 10,
  },
  teamRowLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  teamRowLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamRowInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  teamRowMeta: { flex: 1, minWidth: 0 },
  teamRowName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  teamRowRole: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  activePillSmall: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.35)',
  },
  activePillTextSmall: {
    color: '#86efac',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  teamsMore: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 4,
  },

  footer: {
    color: 'rgba(255,255,255,0.32)',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.8,
    marginTop: 10,
    zIndex: 1,
  },
})

export const PROFILE_SHARE_CARD_WIDTH = CARD_W
export const PROFILE_SHARE_CARD_HEIGHT = CARD_H
