import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { ScreenTheme } from '../lib/theme-ui'

type Option<T extends string> = {
  value: T
  label: string
}

type Props<T extends string> = {
  theme: ScreenTheme
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}

export function SettingsOptionChips<T extends string>({
  theme,
  options,
  value,
  onChange,
}: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? theme.selectedTint : theme.chipBg,
                borderColor: selected ? theme.primary : theme.chipBorder,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.chipText,
                { color: selected ? theme.primaryAccent : theme.textMuted },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
})
