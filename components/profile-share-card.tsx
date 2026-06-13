import { forwardRef } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

import { SPORTMATCH_SHARE_LOGO } from '../lib/app-brand-assets'
import { positionLabel } from '../lib/player-profile-ui'

export type ProfileShareTeamEntry = {
  id: string
  name: string
  logoUri: string | null
  roleLine: string
}

export type ProfileShareCardData = {
  name: string
  photoUri: string
  position?: string
  city?: string
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

const C = {
  frame: '#D4AF37',
  frameInner: '#F0D878',
  sky: '#45C9BE',
  skyDeep: '#2BA89E',
  skyLight: '#6AD4CC',
  ink: '#0B2E34',
  panel: '#123A42',
  panelDeep: '#0A252B',
  gold: '#F5C518',
  coral: '#E84855',
  white: '#FFFFFF',
  cream: '#F7F3E8',
  muted: 'rgba(255,255,255,0.68)',
  faint: 'rgba(255,255,255,0.38)',
}

const FADE_STOPS = [0.04, 0.1, 0.18, 0.28, 0.42, 0.58, 0.76, 0.92]

/** Tarjeta 9:16 — cromo coleccionable premium (referencia WC / Panini). */
export const ProfileShareCard = forwardRef<View, Props>(function ProfileShareCard(
  { data },
  ref
) {
  const primaryTeam = data.teams[0] ?? null
  const positionText = data.position ? positionLabel(data.position).toUpperCase() : null
  const cityText = data.city?.trim().toUpperCase() ?? null

  return (
    <View ref={ref} style={styles.outerFrame} collapsable={false}>
      <View style={styles.card}>
        <View style={styles.skyLayer} />
        <View style={styles.skyGlowLeft} />
        <View style={styles.skyGlowRight} />

        <View style={styles.patternRow}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.patternStripe} />
          ))}
        </View>

        <Text style={styles.bgNumTwo} pointerEvents="none">
          2
        </Text>
        <Text style={styles.bgNumSix} pointerEvents="none">
          6
        </Text>

        <View style={styles.topBar}>
          <View style={styles.editionBadge}>
            <Text style={styles.editionKicker}>SportMatch</Text>
            <Text style={styles.editionTitle}>EDICIÓN COLECCIONISTA</Text>
          </View>
          <Image
            source={SPORTMATCH_SHARE_LOGO}
            style={styles.topLogo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.heroStage}>
          <View style={styles.heroRing} />
          <Image source={{ uri: data.photoUri }} style={styles.heroPhoto} />
          <View style={styles.heroFade}>
            {FADE_STOPS.map((opacity, index) => (
              <View
                key={index}
                style={[
                  styles.heroFadeSlice,
                  { backgroundColor: `rgba(10, 37, 43, ${opacity})` },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.infoPanel}>
          <View style={styles.panelSheen} />
          <View style={styles.goldRule} />

          <View style={styles.identityBlock}>
            <Text style={styles.playerName} numberOfLines={1}>
              {data.name.toUpperCase()}
            </Text>
            <View style={styles.metaRow}>
              {positionText ? (
                <View style={styles.positionBadge}>
                  <Text style={styles.positionBadgeText}>{positionText}</Text>
                </View>
              ) : null}
              {cityText ? <Text style={styles.cityText}>{cityText}</Text> : null}
            </View>
          </View>

          <View style={styles.statsBar}>
            <StatCell label="VIC" value={data.playerWins} accent={C.gold} />
            <View style={styles.statDivider} />
            <StatCell label="EMP" value={data.playerDraws} accent="#FBBF24" />
            <View style={styles.statDivider} />
            <StatCell label="DER" value={data.playerLosses} accent="#F87171" />
            <View style={styles.statDivider} />
            <StatCell label="MVP" value={data.mvpWins} accent="#FDE047" highlight />
          </View>

          <View style={styles.teamCard}>
            {primaryTeam?.logoUri ? (
              <Image source={{ uri: primaryTeam.logoUri }} style={styles.teamLogo} />
            ) : primaryTeam ? (
              <View style={styles.teamLogoFallback}>
                <Text style={styles.teamLogoInitial}>
                  {(primaryTeam.name.trim()[0] ?? '?').toUpperCase()}
                </Text>
              </View>
            ) : (
              <View style={styles.teamLogoFallback}>
                <Text style={styles.teamLogoInitial}>—</Text>
              </View>
            )}
            <View style={styles.teamCopy}>
              <Text style={styles.teamKicker}>CLUB</Text>
              <Text style={styles.teamName} numberOfLines={1}>
                {primaryTeam?.name.toUpperCase() ?? 'SIN EQUIPO'}
              </Text>
              {primaryTeam?.roleLine ? (
                <Text style={styles.teamRole} numberOfLines={1}>
                  {primaryTeam.roleLine}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.footerStrip}>
            <View style={styles.footerBrand}>
              <Image
                source={SPORTMATCH_SHARE_LOGO}
                style={styles.footerLogo}
                resizeMode="contain"
              />
              <View>
                <Text style={styles.footerBrandName}>SPORTMATCH</Text>
                <Text style={styles.footerUrl}>sportmatch.cl</Text>
              </View>
            </View>
            <View style={styles.rarityTag}>
              <Text style={styles.rarityTagText}>✓ VERIFICADO</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
})

function StatCell({
  label,
  value,
  accent,
  highlight,
}: {
  label: string
  value: number
  accent: string
  highlight?: boolean
}) {
  return (
    <View style={[styles.statCell, highlight && styles.statCellHighlight]}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  outerFrame: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 24,
    padding: 4,
    backgroundColor: C.frame,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: C.sky,
    borderWidth: 1.5,
    borderColor: C.frameInner,
  },
  skyLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.skyDeep,
    opacity: 0.28,
  },
  skyGlowLeft: {
    position: 'absolute',
    top: 80,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: C.skyLight,
    opacity: 0.22,
  },
  skyGlowRight: {
    position: 'absolute',
    top: 120,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: C.white,
    opacity: 0.1,
  },
  patternRow: {
    position: 'absolute',
    top: 54,
    left: -20,
    right: -20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    transform: [{ rotate: '-8deg' }],
    opacity: 0.08,
  },
  patternStripe: {
    width: 18,
    height: 220,
    backgroundColor: C.white,
    borderRadius: 9,
  },
  bgNumTwo: {
    position: 'absolute',
    left: -18,
    top: 108,
    fontSize: 210,
    fontWeight: '900',
    color: C.gold,
    opacity: 0.34,
    lineHeight: 210,
    letterSpacing: -6,
  },
  bgNumSix: {
    position: 'absolute',
    right: -24,
    top: 148,
    fontSize: 240,
    fontWeight: '900',
    color: C.coral,
    opacity: 0.3,
    lineHeight: 240,
    letterSpacing: -8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    zIndex: 4,
  },
  editionBadge: {
    paddingTop: 2,
    maxWidth: CARD_W * 0.55,
  },
  editionKicker: {
    color: C.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.2,
    opacity: 0.72,
  },
  editionTitle: {
    color: C.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  topLogo: {
    width: 72,
    height: 72,
  },
  heroStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    zIndex: 2,
  },
  heroRing: {
    position: 'absolute',
    bottom: 8,
    width: CARD_W * 0.78,
    height: CARD_W * 0.78,
    borderRadius: CARD_W * 0.39,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroPhoto: {
    width: CARD_W * 0.92,
    height: CARD_H * 0.5,
    resizeMode: 'cover',
    marginBottom: -18,
  },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -18,
    height: 120,
    flexDirection: 'column',
  },
  heroFadeSlice: {
    flex: 1,
  },
  infoPanel: {
    backgroundColor: C.panel,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 10,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.12)',
    zIndex: 3,
  },
  panelSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.panelDeep,
    opacity: 0.42,
  },
  goldRule: {
    position: 'absolute',
    top: 0,
    left: 18,
    right: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.gold,
  },
  identityBlock: {
    marginBottom: 12,
  },
  playerName: {
    color: C.white,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1.2,
    lineHeight: 34,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  positionBadge: {
    backgroundColor: C.gold,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  positionBadgeText: {
    color: C.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  cityText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  statCellHighlight: {
    backgroundColor: 'rgba(253, 224, 71, 0.08)',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
    color: C.white,
  },
  statLabel: {
    color: C.faint,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 8,
  },
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  teamLogo: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: C.cream,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  teamLogoFallback: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  teamLogoInitial: {
    color: C.white,
    fontSize: 18,
    fontWeight: '900',
  },
  teamCopy: {
    flex: 1,
    minWidth: 0,
  },
  teamKicker: {
    color: C.faint,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  teamName: {
    color: C.white,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  teamRole: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  footerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.cream,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  footerLogo: {
    width: 36,
    height: 36,
  },
  footerBrandName: {
    color: C.ink,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  footerUrl: {
    color: 'rgba(11,46,52,0.55)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  rarityTag: {
    backgroundColor: C.ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rarityTagText: {
    color: C.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
})

export const PROFILE_SHARE_CARD_WIDTH = CARD_W
export const PROFILE_SHARE_CARD_HEIGHT = CARD_H
