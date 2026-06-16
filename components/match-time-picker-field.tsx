import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { labelForHm } from '../lib/venue-slots'
import { useScreenTheme } from '../lib/theme-ui'

export function formatMatchTimeLabel(value: string, options: { value: string; label: string }[]): string {
  if (!value) return 'Selecciona la hora'
  const hit = options.find((o) => o.value === value)
  if (hit) return hit.label
  return labelForHm(value)
}

type MatchTimePickerFieldProps = {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  loading?: boolean
  variant?: 'default' | 'revuelta'
  backgroundColor?: string
  borderColor?: string
  textColor?: string
  mutedColor?: string
  modalTitle?: string
}

export function MatchTimePickerField({
  value,
  onChange,
  options,
  loading = false,
  variant = 'default',
  backgroundColor,
  borderColor,
  textColor,
  mutedColor,
  modalTitle = 'Selecciona la hora',
}: MatchTimePickerFieldProps) {
  const theme = useScreenTheme()
  const [open, setOpen] = useState(false)

  const bg = backgroundColor ?? (variant === 'revuelta' ? theme.inputBg : theme.bg)
  const border = borderColor ?? theme.border
  const text = textColor ?? theme.text
  const muted = mutedColor ?? theme.textMuted
  const hasValue = Boolean(value)
  const display = useMemo(
    () => formatMatchTimeLabel(value, options),
    [value, options]
  )
  const isRevuelta = variant === 'revuelta'

  return (
    <>
      <Pressable
        style={[
          isRevuelta ? styles.revueltaBtn : styles.defaultBtn,
          { backgroundColor: bg, borderColor: border },
          loading && styles.btnLoading,
        ]}
        onPress={() => {
          if (!loading) setOpen(true)
        }}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Seleccionar hora del partido"
      >
        {loading ? (
          <ActivityIndicator color={theme.primary} style={styles.loader} />
        ) : (
          <>
            <Text
              style={[
                isRevuelta ? styles.revueltaText : styles.defaultText,
                { color: hasValue ? text : muted },
              ]}
              numberOfLines={1}
            >
              {display}
            </Text>
            <Ionicons
              name="time-outline"
              size={isRevuelta ? 18 : 20}
              color={muted}
            />
          </>
        )}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={[styles.modalWrap, { backgroundColor: theme.overlay }]}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: theme.card,
                borderTopColor: theme.modalSheetTopBorder,
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <View style={[styles.modalIconWrap, { backgroundColor: theme.logoBoxBg }]}>
                <Ionicons name="time-outline" size={22} color={theme.primary} />
              </View>
              <View style={styles.modalHeaderText}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>{modalTitle}</Text>
                <Text style={[styles.modalSub, { color: theme.textMuted }]}>
                  {options.length > 0
                    ? `${options.length} horario${options.length === 1 ? '' : 's'} disponible${options.length === 1 ? '' : 's'}`
                    : 'Sin horarios para esta fecha'}
                </Text>
              </View>
            </View>

            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              contentContainerStyle={styles.modalList}
              renderItem={({ item }) => {
                const selected = item.value === value
                return (
                  <Pressable
                    style={[
                      styles.timeOption,
                      {
                        backgroundColor: selected ? theme.selectedTint : theme.inputBg,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => {
                      onChange(item.value)
                      setOpen(false)
                    }}
                  >
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color={selected ? theme.primary : muted}
                    />
                    <Text
                      style={[
                        styles.timeOptionText,
                        { color: selected ? theme.text : theme.textMuted },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                    ) : null}
                  </Pressable>
                )
              }}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.textMuted }]}>
                  No hay horarios disponibles. Prueba otra fecha o centro.
                </Text>
              }
            />

            <Pressable
              style={[styles.closeBtn, { borderTopColor: theme.border }]}
              onPress={() => setOpen(false)}
            >
              <Text style={[styles.closeBtnText, { color: theme.primary }]}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  defaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 8,
    minHeight: 52,
  },
  defaultText: {
    flex: 1,
    fontSize: 16,
  },
  revueltaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 48,
    gap: 8,
  },
  revueltaText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  btnLoading: {
    justifyContent: 'center',
  },
  loader: {
    flex: 1,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: '72%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 13,
    marginTop: 2,
  },
  modalList: {
    padding: 16,
    gap: 8,
    paddingBottom: 8,
  },
  timeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  timeOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 14,
    lineHeight: 20,
  },
  closeBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
})
