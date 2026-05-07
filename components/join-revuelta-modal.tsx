import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { MatchOpportunity } from '../lib/types'
import { useThemePreference } from '../lib/theme-context'
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
  const { resolved } = useThemePreference()
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
  const dark = resolved === 'dark'

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
        <Pressable style={[styles.fill, dark && styles.fillDark]} onPress={onClose} />
        <View style={[styles.sheet, dark && styles.sheetDark]}>
          <Text style={[styles.title, dark && styles.titleDark]}>
            Unirte a la revuelta
          </Text>
          <Text style={[styles.sub, dark && styles.subDark]}>
            {opportunity.title} — selecciona tu rol.
          </Text>
          <View style={[styles.info, dark && styles.infoDark]}>
            <Text style={[styles.infoText, dark && styles.infoTextDark]}>
              Cupos totales:{' '}
              <Text style={[styles.bold, dark && styles.boldDark]}>
                {loading ? '…' : `${joined}/${needed || '—'}`}
              </Text>
              {needed > 0 ? (
                <Text style={[styles.infoText, dark && styles.infoTextDark]}>
                  {' '}
                  · Libres: {full ? 0 : totalLeft}
                </Text>
              ) : null}
            </Text>
            <Text style={[styles.avail, dark && styles.availDark]}>{availabilityText}</Text>
          </View>
          {submitting ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
          ) : (
            <>
              <Pressable
                style={[styles.btnPrimary, (full || fieldLeft <= 0) && styles.btnDisabled]}
                disabled={submitting || full || fieldLeft <= 0}
                onPress={() => void handleJoin(false)}
              >
                <Text style={styles.btnPrimaryText}>Jugador de campo</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btnSecondary,
                  dark && styles.btnSecondaryDark,
                  (full || gkLeft <= 0) && styles.btnDisabled,
                ]}
                disabled={submitting || full || gkLeft <= 0}
                onPress={() => void handleJoin(true)}
              >
                <Text style={[styles.btnSecondaryText, dark && styles.btnSecondaryTextDark]}>
                  Arquero 🧤
                </Text>
              </Pressable>
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
  infoText: { fontSize: 14, color: '#4b5563' },
  infoTextDark: { color: '#d1d5db' },
  bold: { fontWeight: '700', color: '#111' },
  boldDark: { color: '#f9fafb' },
  avail: { fontSize: 14, fontWeight: '600', color: '#111', marginTop: 8 },
  availDark: { color: '#e5e7eb' },
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
