import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { birthDateToIso, formatBirthDateDisplay } from '../lib/onboarding-utils'
import { useScreenTheme } from '../lib/theme-ui'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseMatchDateIso(iso: string): Date {
  if (ISO_DATE.test(iso)) {
    const d = new Date(`${iso}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d
  }
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d
}

export function formatMatchDateLabel(iso: string): string {
  if (!ISO_DATE.test(iso)) return 'Selecciona la fecha'
  return formatBirthDateDisplay(parseMatchDateIso(iso))
}

type MatchDatePickerFieldProps = {
  value: string
  onChange: (iso: string) => void
  variant?: 'default' | 'revuelta'
  backgroundColor?: string
  borderColor?: string
  textColor?: string
  mutedColor?: string
}

export function MatchDatePickerField({
  value,
  onChange,
  variant = 'default',
  backgroundColor,
  borderColor,
  textColor,
  mutedColor,
}: MatchDatePickerFieldProps) {
  const theme = useScreenTheme()
  const [showPicker, setShowPicker] = useState(false)
  const pickerValue = useMemo(() => parseMatchDateIso(value), [value])
  const minimumDate = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const bg = backgroundColor ?? (variant === 'revuelta' ? theme.inputBg : theme.bg)
  const border = borderColor ?? theme.border
  const text = textColor ?? theme.text
  const muted = mutedColor ?? theme.textMuted
  const hasValue = ISO_DATE.test(value)
  const display = formatMatchDateLabel(value)

  const onPickerChange = (_: unknown, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false)
    if (!selected) return
    onChange(birthDateToIso(selected))
  }

  const isRevuelta = variant === 'revuelta'

  return (
    <View>
      <Pressable
        style={[
          isRevuelta ? styles.revueltaBtn : styles.defaultBtn,
          { backgroundColor: bg, borderColor: border },
        ]}
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel="Seleccionar fecha del partido"
      >
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
          name="calendar-outline"
          size={isRevuelta ? 18 : 20}
          color={muted}
        />
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          onChange={onPickerChange}
        />
      ) : null}
    </View>
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
})
