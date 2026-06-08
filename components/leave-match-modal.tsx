import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import {
  MATCH_LEAVE_REASON_PRESETS,
  type MatchLeaveReasonPresetId,
  matchLeaveReasonLabel,
} from '../lib/match-leave-reasons'
import { useScreenTheme } from '../lib/theme-ui'

type Props = {
  visible: boolean
  matchTitle?: string
  onClose: () => void
  onConfirm: (reason: string) => Promise<boolean>
}

export function LeaveMatchModal({
  visible,
  matchTitle,
  onClose,
  onConfirm,
}: Props) {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const [selected, setSelected] = useState<MatchLeaveReasonPresetId | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    if (!selected || submitting) return
    const reason = matchLeaveReasonLabel(selected)
    setSubmitting(true)
    try {
      const ok = await onConfirm(reason)
      if (ok) {
        setSelected(null)
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    setSelected(null)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.wrap}>
        <Pressable style={styles.fill} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Ionicons name="exit-outline" size={22} color={theme.danger} />
            <Text style={styles.title}>No puedo asistir</Text>
          </View>
          <Text style={styles.sub}>
            {matchTitle
              ? `Salir de «${matchTitle}» y liberar tu cupo.`
              : 'Salir del partido y liberar tu cupo.'}
          </Text>
          <Text style={styles.hint}>Selecciona el motivo de tu salida:</Text>

          {MATCH_LEAVE_REASON_PRESETS.map((preset) => {
            const active = selected === preset.id
            return (
              <Pressable
                key={preset.id}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => setSelected(preset.id)}
                disabled={submitting}
              >
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={[styles.optionText, active && styles.optionTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            )
          })}

          {submitting ? (
            <ActivityIndicator color={theme.danger} style={{ marginTop: 16 }} />
          ) : (
            <View style={styles.actions}>
              <Pressable style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
                onPress={() => void handleConfirm()}
                disabled={!selected}
              >
                <Text style={styles.confirmText}>Confirmar salida</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'flex-end' },
    fill: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.overlay },
    sheet: {
      backgroundColor: theme.cardElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: theme.modalSheetTopBorder,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 28,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    title: { fontSize: 20, fontWeight: '800', color: theme.text },
    sub: { fontSize: 14, color: theme.textMuted, lineHeight: 20, marginBottom: 14 },
    hint: { fontSize: 13, fontWeight: '600', color: theme.textMuted, marginBottom: 10 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 8,
      backgroundColor: theme.chipBg,
    },
    optionActive: {
      borderColor: theme.danger,
      backgroundColor: theme.dangerSurface,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: { borderColor: theme.danger },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.danger,
    },
    optionText: { flex: 1, fontSize: 15, color: theme.text },
    optionTextActive: { fontWeight: '600', color: theme.dangerOnSurface },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    cancelText: { fontSize: 15, fontWeight: '600', color: theme.textMuted },
    confirmBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: theme.danger,
      alignItems: 'center',
    },
    confirmBtnDisabled: { opacity: 0.45 },
    confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  })
}
