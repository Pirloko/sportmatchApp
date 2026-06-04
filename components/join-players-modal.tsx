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
import { useScreenTheme } from '../lib/theme-ui'
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
  const theme = useScreenTheme()
  const styles = useMemo(() => createModalStyles(theme), [theme])
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
        <Pressable style={styles.fill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Postular a la búsqueda</Text>
          <Text style={styles.sub}>
            {opportunity.title} — elige cómo te sumas según lo que busca el
            organizador.
          </Text>
          <View style={styles.info}>
            <Text style={styles.summaryTitle}>{summaryTitle}</Text>
            <Text style={styles.summaryDetail}>{summaryDetail}</Text>
            {needed > 0 && !loading ? (
              <Text style={styles.cupos}>
                Cupos: <Text style={styles.bold}>{joined}</Text>/
                <Text style={styles.bold}>{needed}</Text>
              </Text>
            ) : null}
          </View>
          {submitting ? (
            <ActivityIndicator
              style={{ marginVertical: 12 }}
              color={theme.primary}
            />
          ) : (
            <>
              {rules.kind === 'legacy' && (
                <Pressable
                  style={[
                    styles.btnPrimary,
                    (full || loading) && styles.btnDisabled,
                  ]}
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
                      (full || loading || !gkSlotMixed) && styles.btnDisabled,
                    ]}
                    disabled={submitting || full || loading || !gkSlotMixed}
                    onPress={() => void handleJoin(true)}
                  >
                    <Text style={styles.btnSecondaryText}>
                      Arquero (máx. 1) 🧤
                    </Text>
                  </Pressable>
                </>
              )}
              <Pressable style={styles.btnGhost} onPress={onClose}>
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

function createModalStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    fill: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay,
    },
    sheet: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      paddingBottom: 28,
      backgroundColor: theme.card,
      borderTopColor: theme.modalSheetTopBorder,
      borderTopWidth: theme.isDark ? 1 : 0,
    },
    title: { fontSize: 18, fontWeight: '700', color: theme.text },
    sub: { fontSize: 14, marginTop: 6, marginBottom: 14, color: theme.textMuted },
    info: {
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      backgroundColor: theme.chipBg,
    },
    summaryTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    summaryDetail: { fontSize: 14, marginTop: 4, color: theme.textMuted },
    cupos: { fontSize: 12, marginTop: 8, color: theme.textMuted },
    bold: { fontWeight: '700', color: theme.text },
    btnPrimary: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 10,
      backgroundColor: theme.primary,
    },
    btnPrimaryText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.primaryBtnText,
    },
    btnSecondary: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 10,
      backgroundColor: theme.chipBg,
    },
    btnSecondaryText: { fontSize: 16, fontWeight: '600', color: theme.text },
    btnGhost: { paddingVertical: 12, alignItems: 'center' },
    btnGhostText: { fontSize: 16, color: theme.textMuted },
    btnDisabled: { opacity: 0.45 },
  })
}
