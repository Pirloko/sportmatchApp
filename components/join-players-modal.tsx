import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { playersJoinRules } from '../lib/players-seek-profile'
import { useThemePreference } from '../lib/theme-context'
import type { MatchOpportunity } from '../lib/types'
import { useMatchParticipantCounts } from '../lib/use-match-participant-counts'

type Props = {
  visible: boolean
  onClose: () => void
  opportunity: MatchOpportunity | null
  onJoin: (isGoalkeeper: boolean) => Promise<boolean>
}

export function JoinPlayersModal({
  visible,
  onClose,
  opportunity,
  onJoin,
}: Props) {
  const { resolved } = useThemePreference()
  const [submitting, setSubmitting] = useState(false)
  const { gkCount, fieldCount, joinedCount, loading } = useMatchParticipantCounts(
    opportunity?.id,
    visible && opportunity != null
  )

  if (!opportunity) return null

  const rules = playersJoinRules(opportunity)
  const needed = opportunity.playersNeeded ?? 0
  const joined = joinedCount
  const full = needed > 0 && joined >= needed
  const left = needed > 0 ? Math.max(0, needed - joined) : 0

  const gkSlotMixed = rules.kind === 'mixed' && gkCount < 1
  const fieldSlotMixed =
    rules.kind === 'mixed' && fieldCount < Math.max(0, needed - 1)
  const gkSlotOnly = rules.kind === 'gk_only' && gkCount < needed
  const fieldSlotOnly = rules.kind === 'field_only' && fieldCount < needed

  const summaryTitle = useMemo(() => {
    if (loading) return 'Revisando cupos…'
    if (needed <= 0) return 'Cupos disponibles'
    if (full) return 'Cupos completos'
    if (left === 1) return 'Queda 1 cupo'
    return `Quedan ${left} cupos`
  }, [loading, needed, full, left])

  const summaryDetail = useMemo(() => {
    if (loading) return 'Un segundo…'
    if (needed <= 0) return 'El organizador está recibiendo postulaciones.'
    if (full) return 'Ya no quedan cupos para sumarse a esta búsqueda.'
    switch (rules.kind) {
      case 'field_only':
        return left === 1
          ? 'Se busca 1 jugador de campo.'
          : `Se buscan ${left} jugadores de campo.`
      case 'gk_only':
        return left === 1 ? 'Se busca 1 arquero.' : `Se buscan ${left} arqueros.`
      case 'mixed': {
        const needsGk = gkCount < 1
        const needsField = fieldCount < Math.max(0, needed - 1)
        if (needsGk && !needsField) return 'Solo queda cupo de arquero.'
        if (!needsGk && needsField) return 'Solo quedan cupos de jugadores de campo.'
        if (needsGk && needsField)
          return 'Puedes postular como jugador de campo o como arquero.'
        return 'Cupos disponibles.'
      }
      case 'legacy':
        return left === 1 ? 'Se busca 1 jugador.' : `Se buscan ${left} jugadores.`
    }
  }, [loading, needed, full, left, rules.kind, gkCount, fieldCount])
  const dark = resolved === 'dark'

  const handleJoin = async (asGk: boolean) => {
    if (full) return
    setSubmitting(true)
    try {
      const ok = await onJoin(asGk)
      if (ok) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.wrap}>
        <Pressable style={[styles.fill, dark && styles.fillDark]} onPress={onClose} />
        <View style={[styles.sheet, dark && styles.sheetDark]}>
          <Text style={[styles.title, dark && styles.titleDark]}>
            Postular a la búsqueda
          </Text>
          <Text style={[styles.sub, dark && styles.subDark]}>
            {opportunity.title} — elige cómo te sumas según lo que busca el
            organizador.
          </Text>
          <View style={[styles.info, dark && styles.infoDark]}>
            <Text style={[styles.summaryTitle, dark && styles.summaryTitleDark]}>
              {summaryTitle}
            </Text>
            <Text style={[styles.summaryDetail, dark && styles.summaryDetailDark]}>
              {summaryDetail}
            </Text>
            {needed > 0 && !loading ? (
              <Text style={[styles.cupos, dark && styles.cuposDark]}>
                Cupos: <Text style={[styles.bold, dark && styles.boldDark]}>{joined}</Text>/
                <Text style={[styles.bold, dark && styles.boldDark]}>{needed}</Text>
              </Text>
            ) : null}
          </View>
          {submitting ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
          ) : (
            <>
              {rules.kind === 'legacy' && (
                <Pressable
                  style={[styles.btnPrimary, (full || loading) && styles.btnDisabled]}
                  disabled={submitting || full || loading}
                  onPress={() => void handleJoin(false)}
                >
                  <Text style={styles.btnPrimaryText}>Postular</Text>
                </Pressable>
              )}
              {rules.kind === 'gk_only' && (
                <Pressable
                  style={[
                    styles.btnPrimary,
                    (full || loading || !gkSlotOnly) && styles.btnDisabled,
                  ]}
                  disabled={submitting || full || loading || !gkSlotOnly}
                  onPress={() => void handleJoin(true)}
                >
                  <Text style={styles.btnPrimaryText}>Postular como arquero</Text>
                </Pressable>
              )}
              {rules.kind === 'field_only' && (
                <Pressable
                  style={[
                    styles.btnPrimary,
                    (full || loading || !fieldSlotOnly) && styles.btnDisabled,
                  ]}
                  disabled={submitting || full || loading || !fieldSlotOnly}
                  onPress={() => void handleJoin(false)}
                >
                  <Text style={styles.btnPrimaryText}>
                    Postular como jugador de campo
                  </Text>
                </Pressable>
              )}
              {rules.kind === 'mixed' && (
                <>
                  <Pressable
                    style={[
                      styles.btnPrimary,
                      (full || loading || !fieldSlotMixed) && styles.btnDisabled,
                    ]}
                    disabled={submitting || full || loading || !fieldSlotMixed}
                    onPress={() => void handleJoin(false)}
                  >
                    <Text style={styles.btnPrimaryText}>Jugador de campo</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.btnSecondary,
                      dark && styles.btnSecondaryDark,
                      (full || loading || !gkSlotMixed) && styles.btnDisabled,
                    ]}
                    disabled={submitting || full || loading || !gkSlotMixed}
                    onPress={() => void handleJoin(true)}
                  >
                    <Text style={[styles.btnSecondaryText, dark && styles.btnSecondaryTextDark]}>
                      Arquero (máx. 1) 🧤
                    </Text>
                  </Pressable>
                </>
              )}
              <Pressable style={styles.btnGhost} onPress={onClose}>
                <Text style={[styles.btnGhostText, dark && styles.btnGhostTextDark]}>
                  Cancelar
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  fillDark: { backgroundColor: 'rgba(2,6,23,0.72)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
  },
  sheetDark: {
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: 'rgba(116, 212, 93, 0.28)',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  titleDark: { color: '#f9fafb' },
  sub: { fontSize: 14, color: '#6b7280', marginTop: 6, marginBottom: 14 },
  subDark: { color: '#9ca3af' },
  info: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoDark: { backgroundColor: '#1f2937' },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  summaryTitleDark: { color: '#f9fafb' },
  summaryDetail: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  summaryDetailDark: { color: '#d1d5db' },
  cupos: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  cuposDark: { color: '#9ca3af' },
  bold: { fontWeight: '700', color: '#111' },
  boldDark: { color: '#f9fafb' },
  btnPrimary: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnSecondaryDark: { backgroundColor: '#374151' },
  btnSecondaryText: { color: '#111', fontSize: 16, fontWeight: '600' },
  btnSecondaryTextDark: { color: '#f3f4f6' },
  btnGhost: { paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { color: '#6b7280', fontSize: 16 },
  btnGhostTextDark: { color: '#9ca3af' },
  btnDisabled: { opacity: 0.45 },
})
