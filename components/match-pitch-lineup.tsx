import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'

import {
  type LineupSlot,
  type MatchLineupLayout,
  type RivalBenchSlot,
  type SlotRole,
  lineupRoleLabel,
  slotRoleLabel,
} from '../lib/match-lineup-slots'
import {
  RIVAL_PITCH_SLOT_DEFS,
  rivalSlotPickFromPress,
  type RivalPickTeam,
  type RivalSlotPick,
} from '../lib/rival-lineup-slot'

function useRivalBenchLayout(layout: MatchLineupLayout): boolean {
  return layout.positionSet === 'rival6Bench'
}

/**
 * Coordenadas % sobre la cancha completa.
 * Equipo A (arriba): ARQ → 2 DEF → 2 MED → DEL hacia el centro.
 * Equipo B (abajo): espejo.
 */
const TEAM_A_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 50, y: 9 },   // ARQ
  { x: 22, y: 23 },  // DEF
  { x: 78, y: 23 },  // DEF
  { x: 22, y: 36 },  // MED
  { x: 78, y: 36 },  // MED
  { x: 50, y: 41 },  // DEL (más arriba del medio campo; evita solaparse con equipo B)
]

const TEAM_B_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 50, y: 91 },  // ARQ
  { x: 22, y: 77 },  // DEF
  { x: 78, y: 77 },  // DEF
  { x: 22, y: 64 },  // MED
  { x: 78, y: 64 },  // MED
  { x: 50, y: 59 },  // DEL (más abajo del medio campo)
]

function coordsForSlot(
  slot: LineupSlot,
  teamSide: 'top' | 'bottom'
): { x: number; y: number } {
  const table = teamSide === 'top' ? TEAM_A_POSITIONS : TEAM_B_POSITIONS
  return table[slot.slotIndex] ?? { x: 50, y: teamSide === 'top' ? 25 : 75 }
}

export type PitchLineupTheme = {
  grassA: string
  grassB: string
  line: string
  lineSoft: string
  goal: string
  frame: string
  labelBg: string
  labelText: string
  tokenBg: string
  tokenBorder: string
  tokenEmpty: string
  nameBg: string
  nameText: string
  accent: string
  youRing: string
  muted: string
}

function themeForMode(isDark: boolean, accentGold: string): PitchLineupTheme {
  if (isDark) {
    return {
      grassA: '#1A4D2E',
      grassB: '#1E5935',
      line: 'rgba(255,255,255,0.82)',
      lineSoft: 'rgba(255,255,255,0.45)',
      goal: 'rgba(255,255,255,0.35)',
      frame: accentGold,
      labelBg: 'rgba(0,0,0,0.55)',
      labelText: accentGold,
      tokenBg: '#F3F4F6',
      tokenBorder: 'rgba(255,255,255,0.9)',
      tokenEmpty: 'rgba(0,0,0,0.35)',
      nameBg: 'rgba(0,0,0,0.72)',
      nameText: '#FFFFFF',
      accent: accentGold,
      youRing: '#37D67A',
      muted: 'rgba(255,255,255,0.65)',
    }
  }
  return {
    grassA: '#3D9B5F',
    grassB: '#349653',
    line: 'rgba(255,255,255,0.95)',
    lineSoft: 'rgba(255,255,255,0.55)',
    goal: 'rgba(255,255,255,0.5)',
    frame: '#B8860B',
    labelBg: 'rgba(255,255,255,0.88)',
    labelText: '#1B4332',
    tokenBg: '#FFFFFF',
    tokenBorder: '#FFFFFF',
    tokenEmpty: 'rgba(255,255,255,0.22)',
    nameBg: 'rgba(255,255,255,0.94)',
    nameText: '#1F2A22',
    accent: '#B8860B',
    youRing: '#2F9E44',
    muted: 'rgba(255,255,255,0.85)',
  }
}

type Props = {
  layout: MatchLineupLayout
  loading?: boolean
  canJoin?: boolean
  currentUserId?: string
  highlightTeam?: 'A' | 'B' | null
  isDark: boolean
  accentGold?: string
  onEmptySlotPress?: (team: 'A' | 'B', role: SlotRole) => void
  /** Bando del usuario en partido rival (solo puede tocar cupos de su equipo). */
  rivalJoinTeam?: RivalPickTeam | null
  onRivalSlotPress?: (pick: RivalSlotPick) => void
  onPlayerPress?: (userId: string) => void
}

export function MatchPitchLineup({
  layout,
  loading = false,
  canJoin = false,
  currentUserId,
  highlightTeam = null,
  isDark,
  accentGold = '#C9A227',
  onEmptySlotPress,
  rivalJoinTeam = null,
  onRivalSlotPress,
  onPlayerPress,
}: Props) {
  const theme = useMemo(
    () => themeForMode(isDark, accentGold),
    [isDark, accentGold]
  )
  const { width } = useWindowDimensions()
  const maxBlockWidth = Math.min(width - 40, 400)
  const rivalBenchLayout = useRivalBenchLayout(layout)
  const pitchWidth = maxBlockWidth
  const pitchHeight =
    layout.mode === 'dual'
      ? Math.round(pitchWidth * 1.55)
      : Math.round(pitchWidth * 0.85)
  const tokenSize = Math.min(48, Math.floor(pitchWidth * 0.115))

  if (loading) {
    return (
      <View
        style={[
          styles.loadingWrap,
          { borderColor: theme.frame, width: maxBlockWidth },
        ]}
      >
        <ActivityIndicator color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.muted }]}>
          Cargando plantilla…
        </Text>
      </View>
    )
  }

  const pitchEl = (
    <View
      style={[
        styles.pitch,
        {
          width: pitchWidth,
          height: pitchHeight,
          borderColor: theme.line,
          backgroundColor: theme.grassA,
        },
      ]}
    >
      <GrassStripes theme={theme} height={pitchHeight} />
      <PitchMarkings
        theme={theme}
        width={pitchWidth}
        height={pitchHeight}
        dual={layout.mode === 'dual'}
      />

      {layout.mode === 'single' ? (
        <View style={[styles.teamHeaderInPitch, { backgroundColor: theme.labelBg }]}>
          <Text style={[styles.teamHeaderText, { color: theme.labelText }]}>
            {layout.teamALabel}
          </Text>
        </View>
      ) : null}

      {layout.teamA.map((slot) => {
        const { x, y } = coordsForSlot(slot, 'top')
        const slotDef = RIVAL_PITCH_SLOT_DEFS.find((d) => d.slotIndex === slot.slotIndex)
        const canTap = Boolean(
          canJoin &&
            !slot.player &&
            (!rivalBenchLayout ||
              (rivalJoinTeam === 'A' && !!onRivalSlotPress && !!slotDef))
        )
        return (
          <PitchPlayerToken
            key={`A-${slot.slotIndex}-${slot.role}`}
            slot={slot}
            xPct={x}
            yPct={y}
            pitchWidth={pitchWidth}
            pitchHeight={pitchHeight}
            tokenSize={tokenSize}
            theme={theme}
            canJoin={canTap}
            isYou={!!currentUserId && slot.player?.id === currentUserId}
            onPressEmpty={
              rivalBenchLayout && slotDef && onRivalSlotPress && rivalJoinTeam === 'A'
                ? () => {
                    const pick = rivalSlotPickFromPress('A', slotDef.slot)
                    if (pick) onRivalSlotPress(pick)
                  }
                : onEmptySlotPress
                  ? () => onEmptySlotPress('A', slot.role)
                  : undefined
            }
            onPlayerPress={onPlayerPress}
          />
        )
      })}

      {layout.mode === 'dual' &&
        layout.teamB.map((slot) => {
          const { x, y } = coordsForSlot(slot, 'bottom')
          const slotDef = RIVAL_PITCH_SLOT_DEFS.find((d) => d.slotIndex === slot.slotIndex)
          const canTap = Boolean(
            canJoin &&
              !slot.player &&
              (!rivalBenchLayout ||
                (rivalJoinTeam === 'B' && !!onRivalSlotPress && !!slotDef))
          )
          return (
            <PitchPlayerToken
              key={`B-${slot.slotIndex}-${slot.role}`}
              slot={slot}
              xPct={x}
              yPct={y}
              pitchWidth={pitchWidth}
              pitchHeight={pitchHeight}
              tokenSize={tokenSize}
              theme={theme}
              canJoin={canTap}
              isYou={!!currentUserId && slot.player?.id === currentUserId}
              onPressEmpty={
                rivalBenchLayout && slotDef && onRivalSlotPress && rivalJoinTeam === 'B'
                  ? () => {
                      const pick = rivalSlotPickFromPress('B', slotDef.slot)
                      if (pick) onRivalSlotPress(pick)
                    }
                  : onEmptySlotPress
                    ? () => onEmptySlotPress('B', slot.role)
                    : undefined
              }
              onPlayerPress={onPlayerPress}
            />
          )
        })}
    </View>
  )

  return (
    <View style={[styles.wrap, { width: maxBlockWidth }]}>
      {layout.pendingLineup ? (
        <Text style={[styles.pendingBanner, { color: theme.accent }]}>
          Sorteo pendiente · posiciones provisorias
        </Text>
      ) : null}

      {layout.mode === 'dual' ? (
        <TeamDualHeader
          label={layout.teamALabel}
          logoUrl={layout.teamALogoUrl}
          theme={theme}
        />
      ) : null}

      {rivalBenchLayout && layout.benchA?.length ? (
        <RivalBenchRow
          bench={layout.benchA}
          pickTeam="A"
          theme={theme}
          canJoin={canJoin}
          rivalJoinTeam={rivalJoinTeam}
          currentUserId={currentUserId}
          onRivalSlotPress={onRivalSlotPress}
          onPlayerPress={onPlayerPress}
        />
      ) : null}

      {pitchEl}

      {rivalBenchLayout && layout.benchB?.length ? (
        <RivalBenchRow
          bench={layout.benchB}
          pickTeam="B"
          theme={theme}
          canJoin={canJoin}
          rivalJoinTeam={rivalJoinTeam}
          currentUserId={currentUserId}
          onRivalSlotPress={onRivalSlotPress}
          onPlayerPress={onPlayerPress}
        />
      ) : null}

      {layout.mode === 'dual' ? (
        <TeamDualHeader
          label={layout.teamBLabel}
          logoUrl={layout.teamBLogoUrl}
          theme={theme}
        />
      ) : null}
    </View>
  )
}

function GrassStripes({
  theme,
  height,
}: {
  theme: PitchLineupTheme
  height: number
}) {
  const stripes = Math.ceil(height / 28)
  return (
    <>
      {Array.from({ length: stripes }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: i * 28,
            height: 28,
            backgroundColor: i % 2 === 0 ? theme.grassA : theme.grassB,
          }}
        />
      ))}
    </>
  )
}

function PitchMarkings({
  theme,
  width,
  height,
  dual,
}: {
  theme: PitchLineupTheme
  width: number
  height: number
  dual: boolean
}) {
  const pad = 8
  const boxW = width * 0.58
  const boxH = dual ? height * 0.14 : height * 0.2
  const sixW = width * 0.34
  const sixH = dual ? height * 0.06 : height * 0.09
  const circleR = Math.min(width * 0.2, height * 0.09)

  return (
    <>
      <View
        style={[
          styles.touchLine,
          { top: pad, left: pad, right: pad, bottom: pad, borderColor: theme.line },
        ]}
      />

      {dual ? (
        <View
          style={[
            styles.halfway,
            { top: height / 2 - 1, left: pad, right: pad, backgroundColor: theme.line },
          ]}
        />
      ) : null}

      <View
        style={[
          styles.centerCircle,
          {
            width: circleR * 2,
            height: circleR * 2,
            borderRadius: circleR,
            top: height / 2 - circleR,
            left: width / 2 - circleR,
            borderColor: theme.line,
          },
        ]}
      />
      <View
        style={[
          styles.centerSpot,
          {
            top: height / 2 - 3,
            left: width / 2 - 3,
            backgroundColor: theme.line,
          },
        ]}
      />

      {/* Área superior (abierta hacia la portería) */}
      <View
        style={[
          styles.penBoxTop,
          {
            top: pad,
            left: width / 2 - boxW / 2,
            width: boxW,
            height: boxH,
            borderColor: theme.line,
          },
        ]}
      />
      <View
        style={[
          styles.penBoxTop,
          {
            top: pad,
            left: width / 2 - sixW / 2,
            width: sixW,
            height: sixH,
            borderColor: theme.line,
          },
        ]}
      />
      <View
        style={[
          styles.goalLine,
          {
            top: pad - 1,
            left: width / 2 - width * 0.22,
            width: width * 0.44,
            backgroundColor: theme.goal,
          },
        ]}
      />

      {dual ? (
        <>
          <View
            style={[
              styles.penBoxBottom,
              {
                bottom: pad,
                left: width / 2 - boxW / 2,
                width: boxW,
                height: boxH,
                borderColor: theme.line,
              },
            ]}
          />
          <View
            style={[
              styles.penBoxBottom,
              {
                bottom: pad,
                left: width / 2 - sixW / 2,
                width: sixW,
                height: sixH,
                borderColor: theme.line,
              },
            ]}
          />
          <View
            style={[
              styles.goalLine,
              {
                bottom: pad - 1,
                left: width / 2 - width * 0.22,
                width: width * 0.44,
                backgroundColor: theme.goal,
              },
            ]}
          />
        </>
      ) : null}

      {/* Arcos de corner simplificados */}
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <View
          key={c}
          style={[
            styles.cornerArc,
            {
              borderColor: theme.lineSoft,
              ...(c === 'tl' && { top: pad, left: pad }),
              ...(c === 'tr' && { top: pad, right: pad }),
              ...(c === 'bl' && { bottom: pad, left: pad }),
              ...(c === 'br' && { bottom: pad, right: pad }),
            },
          ]}
        />
      ))}
    </>
  )
}

function PitchPlayerToken({
  slot,
  xPct,
  yPct,
  pitchWidth,
  pitchHeight,
  tokenSize,
  theme,
  canJoin,
  isYou,
  onPressEmpty,
  onPlayerPress,
}: {
  slot: LineupSlot
  xPct: number
  yPct: number
  pitchWidth: number
  pitchHeight: number
  tokenSize: number
  theme: PitchLineupTheme
  canJoin: boolean
  isYou: boolean
  onPressEmpty?: () => void
  onPlayerPress?: (userId: string) => void
}) {
  const player = slot.player
  const role = player ? lineupRoleLabel(player) : slotRoleLabel(slot.role)
  const empty = !player
  const interactive = empty && canJoin && !!onPressEmpty
  const blockH = tokenSize + 18
  const left = (pitchWidth * xPct) / 100 - tokenSize / 2
  const top = (pitchHeight * yPct) / 100 - blockH / 2

  const body = (
    <>
      <View
        style={[
          styles.tokenCircle,
          {
            width: tokenSize,
            height: tokenSize,
            borderRadius: tokenSize / 2,
            backgroundColor: empty ? theme.tokenEmpty : theme.tokenBg,
            borderColor: isYou ? theme.youRing : theme.tokenBorder,
            borderWidth: isYou ? 3 : 2,
          },
        ]}
      >
        {empty ? (
          <>
            <Ionicons name="person-outline" size={tokenSize * 0.38} color={theme.muted} />
            <View style={[styles.roleChip, { backgroundColor: theme.accent }]}>
              <Text style={styles.roleChipText}>{role}</Text>
            </View>
            {interactive ? (
              <View style={[styles.plusDot, { backgroundColor: theme.accent }]}>
                <Ionicons name="add" size={12} color="#111" />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Image
              source={{ uri: player.photo }}
              style={{
                width: tokenSize - 6,
                height: tokenSize - 6,
                borderRadius: (tokenSize - 6) / 2,
              }}
              contentFit="cover"
            />
            {role ? (
              <View style={[styles.roleChip, { backgroundColor: theme.accent }]}>
                <Text style={styles.roleChipText}>{role}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
      <View
        style={[styles.namePill, { backgroundColor: theme.nameBg, maxWidth: tokenSize + 36 }]}
      >
        <Text
          style={[styles.namePillText, { color: theme.nameText }]}
          numberOfLines={1}
        >
          {empty ? (interactive ? 'Unirme' : slotRoleLabel(slot.role)) : player.name.split(' ')[0]}
        </Text>
      </View>
    </>
  )

  const posStyle = {
    ...styles.tokenWrap,
    left,
    top,
    width: tokenSize + 4,
  }

  if (interactive) {
    return (
      <Pressable
        onPress={onPressEmpty}
        style={({ pressed }) => [posStyle, pressed ? { opacity: 0.9 } : null]}
        accessibilityLabel={`Unirse equipo ${slot.team}`}
      >
        {body}
      </Pressable>
    )
  }

  if (player && onPlayerPress) {
    return (
      <Pressable
        onPress={() => onPlayerPress(player.id)}
        style={({ pressed }) => [posStyle, pressed ? { opacity: 0.88 } : null]}
        accessibilityLabel={`Ver perfil de ${player.name}`}
      >
        {body}
      </Pressable>
    )
  }

  return <View style={posStyle}>{body}</View>
}

function RivalBenchRow({
  bench,
  pickTeam,
  theme,
  canJoin,
  rivalJoinTeam,
  currentUserId,
  onRivalSlotPress,
  onPlayerPress,
}: {
  bench: RivalBenchSlot[]
  pickTeam: RivalPickTeam
  theme: PitchLineupTheme
  canJoin: boolean
  rivalJoinTeam: RivalPickTeam | null
  currentUserId?: string
  onRivalSlotPress?: (pick: RivalSlotPick) => void
  onPlayerPress?: (userId: string) => void
}) {
  const tokenSize = 40
  return (
    <View style={styles.benchRow}>
      <Text style={[styles.benchRowLabel, { color: theme.labelText }]}>SUPL.</Text>
      <View style={styles.benchRowSlots}>
        {bench.map((b) => {
          const empty = !b.player
          const isYou = !!currentUserId && b.player?.id === currentUserId
          const canTap =
            canJoin &&
            empty &&
            rivalJoinTeam === pickTeam &&
            !!onRivalSlotPress
          const pick = rivalSlotPickFromPress(pickTeam, b.lineupSlot)
          const body = (
            <>
              <View
                style={[
                  styles.benchTokenCircle,
                  {
                    width: tokenSize,
                    height: tokenSize,
                    borderRadius: tokenSize / 2,
                    backgroundColor: empty ? theme.tokenEmpty : theme.tokenBg,
                    borderColor: isYou ? theme.youRing : theme.tokenBorder,
                    borderWidth: isYou ? 3 : 2,
                  },
                ]}
              >
                {empty ? (
                  <>
                    <Ionicons
                      name="person-outline"
                      size={tokenSize * 0.38}
                      color={theme.muted}
                    />
                    {canTap ? (
                      <View style={[styles.plusDot, { backgroundColor: theme.accent }]}>
                        <Ionicons name="add" size={12} color="#111" />
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Image
                    source={{ uri: b.player!.photo }}
                    style={{
                      width: tokenSize - 6,
                      height: tokenSize - 6,
                      borderRadius: (tokenSize - 6) / 2,
                    }}
                    contentFit="cover"
                  />
                )}
              </View>
              <Text
                style={[styles.benchName, { color: theme.nameText }]}
                numberOfLines={1}
              >
                {empty
                  ? canTap
                    ? 'Unirme'
                    : 'Libre'
                  : (b.player!.name.split(/\s+/)[0] ?? b.player!.name).slice(0, 12)}
              </Text>
            </>
          )
          if (canTap && pick) {
            return (
              <Pressable
                key={b.lineupSlot}
                style={styles.benchSlot}
                onPress={() => onRivalSlotPress(pick)}
                accessibilityLabel={`Unirme cupo ${b.lineupSlot}`}
              >
                {body}
              </Pressable>
            )
          }
          if (b.player && onPlayerPress) {
            return (
              <Pressable
                key={b.lineupSlot}
                style={styles.benchSlot}
                onPress={() => onPlayerPress(b.player!.id)}
                accessibilityLabel={`Ver perfil de ${b.player!.name}`}
              >
                {body}
              </Pressable>
            )
          }
          return (
            <View key={b.lineupSlot} style={styles.benchSlot}>
              {body}
            </View>
          )
        })}
      </View>
    </View>
  )
}

function TeamDualHeader({
  label,
  logoUrl,
  theme,
}: {
  label: string
  logoUrl?: string
  theme: PitchLineupTheme
}) {
  if (!logoUrl) {
    return (
      <View style={[styles.teamHeader, { backgroundColor: theme.labelBg }]}>
        <Text style={[styles.teamHeaderText, { color: theme.labelText }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    )
  }
  return (
    <View
      style={[
        styles.teamHeader,
        styles.teamHeaderWithLogo,
        { backgroundColor: theme.labelBg },
      ]}
    >
      <Image source={{ uri: logoUrl }} style={styles.teamHeaderLogo} contentFit="cover" />
      <Text style={[styles.teamHeaderText, { color: theme.labelText, flex: 1, textAlign: 'left' }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', marginTop: 8 },
  benchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  benchRowLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    width: 36,
  },
  benchRowSlots: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
  },
  benchSlot: { alignItems: 'center', minWidth: 56 },
  benchTokenCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  benchName: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 64,
  },
  loadingWrap: {
    minHeight: 200,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    alignSelf: 'center',
  },
  loadingText: { fontSize: 14, fontWeight: '600' },
  pendingBanner: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  pitch: {
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
  },
  touchLine: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
  },
  halfway: { position: 'absolute', height: 2 },
  centerCircle: {
    position: 'absolute',
    borderWidth: 2,
  },
  centerSpot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  penBoxTop: {
    position: 'absolute',
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
  penBoxBottom: {
    position: 'absolute',
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopWidth: 2,
  },
  goalLine: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
  },
  cornerArc: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderWidth: 2,
    borderRadius: 14,
  },
  teamHeader: {
    alignSelf: 'stretch',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    alignItems: 'center',
  },
  teamHeaderWithLogo: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  teamHeaderLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  teamHeaderInPitch: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    left: '12%',
    right: '12%',
    zIndex: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  teamHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  tokenWrap: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10,
  },
  tokenCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  plusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  roleChip: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  roleChipText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#111',
  },
  namePill: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  namePillText: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
})
