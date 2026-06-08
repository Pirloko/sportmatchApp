import { Ionicons } from '@expo/vector-icons'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { formatCLP } from '../lib/format-money'
import {
  matchCourtCostExplanation,
  type MatchCourtCost,
} from '../lib/match-court-cost'
import { useScreenTheme } from '../lib/theme-ui'

type Props = {
  cost: MatchCourtCost
  organizerName?: string
  /** Franja compacta (estilo tarjeta lista web). */
  compact?: boolean
}

export function MatchCourtCostCard({
  cost,
  organizerName = '',
  compact = false,
}: Props) {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])

  if (compact) {
    return (
      <View style={styles.compactStrip}>
        <Ionicons name="cash-outline" size={16} color={theme.accentOnSurface} />
        <Text style={styles.compactText}>
          Cancha {formatCLP(cost.totalCost)} · ~{formatCLP(cost.perPlayerCost)} c/u
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <Ionicons name="cash-outline" size={20} color={theme.accentOnSurface} />
        </View>
        <Text style={styles.title}>Costo de cancha</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Total estimado</Text>
          <Text style={styles.statValue}>{formatCLP(cost.totalCost)}</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Por jugador (aprox.)</Text>
          <Text style={styles.statValue}>{formatCLP(cost.perPlayerCost)}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <Text style={styles.explanation}>
        {matchCourtCostExplanation(organizerName, cost)}
      </Text>
    </View>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    compactStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: theme.isDark
        ? 'rgba(251, 191, 36, 0.12)'
        : 'rgba(254, 243, 199, 0.95)',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(251, 191, 36, 0.28)'
        : 'rgba(217, 119, 6, 0.18)',
    },
    compactText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: theme.isDark ? '#FDE68A' : '#92400E',
    },
    card: {
      borderRadius: 16,
      padding: 16,
      backgroundColor: theme.isDark
        ? 'rgba(251, 191, 36, 0.08)'
        : 'rgba(254, 243, 199, 0.55)',
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(251, 191, 36, 0.22)'
        : 'rgba(217, 119, 6, 0.15)',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark
        ? 'rgba(251, 191, 36, 0.18)'
        : 'rgba(251, 191, 36, 0.35)',
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.isDark ? '#FEF3C7' : '#78350F',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    statCol: { flex: 1 },
    statLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.isDark ? 'rgba(254, 243, 199, 0.65)' : '#A16207',
      marginBottom: 4,
    },
    statValue: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.isDark ? '#FFFBEB' : '#451A03',
      letterSpacing: -0.3,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.isDark
        ? 'rgba(251, 191, 36, 0.25)'
        : 'rgba(217, 119, 6, 0.2)',
      marginVertical: 14,
    },
    explanation: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.isDark ? 'rgba(254, 243, 199, 0.88)' : '#57534E',
    },
  })
}
