import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import {
  formatMatchClock,
  formatMatchWeekdayDate,
  levelLabel,
} from '../lib/format-match'
import type { RivalEncounterDetail } from '../lib/supabase/rival-match-detail'
import type { Level, MatchStatus } from '../lib/types'

type Props = {
  encounter: RivalEncounterDetail
  level: Level
  status: MatchStatus
  venue: string
  location: string
  dateTime: Date
  joinedCount: number
  isDark: boolean
  tokens: {
    primaryGreen: string
    accentGold: string
    textPrimary: string
    textMuted: string
    cardDark: string
    borderDark: string
  }
}

function TeamBadge({
  side,
  logoUrl,
  isDark,
  textColor,
}: {
  side: { name: string }
  logoUrl: string
  isDark: boolean
  textColor: string
}) {
  const [logoFailed, setLogoFailed] = useState(false)
  const showLogo = !!logoUrl?.trim() && !logoFailed
  return (
    <View style={styles.teamCol}>
      <View style={[styles.logoRing, isDark && styles.logoRingDark]}>
        {showLogo ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.logoImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={`Escudo de ${side.name}`}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <View style={[styles.logoPlaceholder, isDark && styles.logoPlaceholderDark]}>
            <Ionicons name="shield" size={32} color={isDark ? '#8FB89A' : '#3D6B4A'} />
          </View>
        )}
      </View>
      <Text style={[styles.teamName, { color: textColor }]} numberOfLines={2}>
        {side.name}
      </Text>
    </View>
  )
}

export function RivalMatchEncounter({
  encounter,
  level,
  status,
  venue,
  location,
  dateTime,
  joinedCount,
  isDark,
  tokens,
}: Props) {
  const away = encounter.away ?? {
    teamId: 'pending',
    name: encounter.awaitingRival ? 'Buscando rival' : 'Por confirmar',
    logoUrl: '',
  }

  const nameColor = isDark ? '#E8F2EB' : '#1F2A22'
  const playersLabel =
    joinedCount === 1 ? '1 jugador inscrito' : `${joinedCount} jugadores inscritos`

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#1A2E22' : '#F4FAF5',
          borderColor: tokens.borderDark,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.levelPill, { backgroundColor: tokens.primaryGreen + '22' }]}>
          <Text style={[styles.levelPillText, { color: tokens.primaryGreen }]}>
            {levelLabel(level)}
          </Text>
        </View>
        {status === 'confirmed' ? (
          <View style={[styles.confirmedPill, { backgroundColor: tokens.primaryGreen }]}>
            <Text style={styles.confirmedText}>Confirmado</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.vsRow}>
        <TeamBadge
          side={encounter.home}
          logoUrl={encounter.home.logoUrl}
          isDark={isDark}
          textColor={nameColor}
        />
        <View style={styles.vsCenter}>
          <View style={[styles.vsCircle, { borderColor: tokens.accentGold }]}>
            <Text style={[styles.vsText, { color: tokens.accentGold }]}>VS</Text>
          </View>
        </View>
        <TeamBadge side={away} logoUrl={away.logoUrl} isDark={isDark} textColor={nameColor} />
      </View>

      <View
        style={[
          styles.venueStrip,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#E2F0E4' },
        ]}
      >
        <View style={styles.venueIconCol}>
          <Ionicons name="football" size={22} color={tokens.primaryGreen} />
          <Text style={[styles.venueLabel, { color: tokens.textMuted }]}>Cancha</Text>
        </View>
        <View style={styles.venueTextCol}>
          <Text style={[styles.venueName, { color: tokens.textPrimary }]} numberOfLines={1}>
            {venue}
          </Text>
          <Text style={[styles.venueLoc, { color: tokens.textMuted }]} numberOfLines={1}>
            {location}
          </Text>
        </View>
      </View>

      <View style={styles.metaList}>
        <MetaLine icon="calendar-outline" text={formatMatchWeekdayDate(dateTime)} tokens={tokens} />
        <MetaLine icon="time-outline" text={`${formatMatchClock(dateTime)} hrs`} tokens={tokens} />
        <MetaLine icon="people-outline" text={playersLabel} tokens={tokens} />
      </View>
    </View>
  )
}

function MetaLine({
  icon,
  text,
  tokens,
}: {
  icon: keyof typeof Ionicons.glyphMap
  text: string
  tokens: { primaryGreen: string; textPrimary: string }
}) {
  return (
    <View style={styles.metaLine}>
      <Ionicons name={icon} size={16} color={tokens.primaryGreen} />
      <Text style={[styles.metaText, { color: tokens.textPrimary }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  levelPillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  confirmedPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  confirmedText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  teamCol: { flex: 1, alignItems: 'center', maxWidth: '38%' },
  logoRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  logoRingDark: { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: '#2A3D32' },
  logoImg: { width: '100%', height: '100%' },
  logoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F0EA',
  },
  logoPlaceholderDark: { backgroundColor: '#243528' },
  teamName: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 17,
  },
  vsCenter: { width: 56, alignItems: 'center', justifyContent: 'center' },
  vsCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  vsText: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  venueStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 12,
  },
  venueIconCol: { alignItems: 'center', width: 48 },
  venueLabel: { fontSize: 10, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  venueTextCol: { flex: 1 },
  venueName: { fontSize: 16, fontWeight: '800' },
  venueLoc: { fontSize: 13, marginTop: 2 },
  metaList: { gap: 8 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
})
