import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { useScreenTheme } from '../lib/theme-ui'
import type { MatchOpportunity } from '../lib/types'
import { useMatchParticipantCounts } from '../lib/use-match-participant-counts'

const MAX_GOALKEEPERS = 2

type Props = {
  visible: boolean
  onClose: () => void
  opportunity: MatchOpportunity | null
  /** Devuelve true si el join fue exitoso (para cerrar el modal). */
  onJoin: (isGoalkeeper: boolean) => Promise<boolean>
}

export function JoinRevueltaModal({
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

  const needed = opportunity.playersNeeded ?? 0
  const cap = needed
  const joined = loading ? (opportunity.playersJoined ?? 0) : joinedCount
  const totalLeft = cap > 0 ? Math.max(0, cap - joined) : 999
  const gkLeft = Math.max(0, MAX_GOALKEEPERS - gkCount)
  const fieldCap = Math.max(0, cap - MAX_GOALKEEPERS)
  const fieldLeft = Math.max(0, fieldCap - fieldCount)
  const full = cap > 0 && joined >= cap

  const availabilityText = useMemo(() => {
    if (full) return 'No quedan cupos.'
    if (fieldLeft <= 0 && gkLeft > 0) return 'Solo quedan cupos de arquero.'
    if (gkLeft <= 0 && fieldLeft > 0) return 'Quedan cupos de jugadores.'
    if (gkLeft > 0 && fieldLeft > 0) {
      return `Quedan ${fieldLeft} de jugadores y ${gkLeft} de arquero.`
    }
    return 'Cupos disponibles.'
  }, [full, fieldLeft, gkLeft])

  const handleJoin = async (asGk: boolean) => {
    if (full) return
    if (asGk && gkLeft <= 0) return
    if (!asGk && fieldLeft <= 0) return
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
          <Text style={styles.title}>Unirte a la revuelta</Text>
          <Text style={styles.sub}>
            {opportunity.title} — selecciona tu rol.
          </Text>
          <View style={styles.info}>
            <Text style={styles.infoText}>
              Cupos totales:{' '}
              <Text style={styles.bold}>
                {loading ? '…' : `${joined}/${needed || '—'}`}
              </Text>
              {needed > 0 ? (
                <Text style={styles.infoMuted}>
                  {' '}
                  · Libres: {full ? 0 : totalLeft}
                </Text>
              ) : null}
            </Text>
            <Text style={styles.avail}>{availabilityText}</Text>
          </View>
          {submitting ? (
            <ActivityIndicator
              style={{ marginVertical: 12 }}
              color={theme.primary}
            />
          ) : (
            <>
              <Pressable
                style={[
                  styles.btnPrimary,
                  (full || fieldLeft <= 0) && styles.btnDisabled,
                ]}
                disabled={submitting || full || fieldLeft <= 0}
                onPress={() => void handleJoin(false)}
              >
                <Text style={styles.btnPrimaryText}>Jugador de campo</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btnSecondary,
                  (full || gkLeft <= 0) && styles.btnDisabled,
                ]}
                disabled={submitting || full || gkLeft <= 0}
                onPress={() => void handleJoin(true)}
              >
                <Text style={styles.btnSecondaryText}>Arquero 🧤</Text>
              </Pressable>
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
    infoText: { fontSize: 14, color: theme.textMuted },
    infoMuted: { color: theme.textMuted },
    bold: { fontWeight: '700', color: theme.text },
    avail: { fontSize: 14, fontWeight: '600', marginTop: 8, color: theme.text },
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
