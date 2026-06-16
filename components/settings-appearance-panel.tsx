import { Text, View } from 'react-native'

import {
  COLOR_VISION_HINTS,
  COLOR_VISION_LABELS,
  type ColorVisionMode,
} from '../lib/color-vision'
import {
  useThemePreference,
  type ThemePreference,
} from '../lib/theme-context'
import type { ScreenTheme } from '../lib/theme-ui'
import { SettingsOptionChips } from './settings-option-chips'

type Props = {
  theme: ScreenTheme
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Auto' },
]

const VISION_OPTIONS: { value: ColorVisionMode; label: string }[] = [
  { value: 'normal', label: COLOR_VISION_LABELS.normal },
  { value: 'redGreen', label: COLOR_VISION_LABELS.redGreen },
  { value: 'blueYellow', label: COLOR_VISION_LABELS.blueYellow },
]

export function SettingsAppearancePanel({ theme }: Props) {
  const { preference, setPreference, colorVision, setColorVision } =
    useThemePreference()

  return (
    <View>
      <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 6, lineHeight: 20 }}>
        Elige el tema y, si lo necesitas, una paleta más clara para distinguir
        victorias, derrotas y alertas.
      </Text>

      <Text
        style={{
          fontSize: 12,
          fontWeight: '800',
          color: theme.textMuted,
          marginTop: 14,
          letterSpacing: 0.6,
        }}
      >
        TEMA
      </Text>
      <SettingsOptionChips
        theme={theme}
        options={THEME_OPTIONS}
        value={preference}
        onChange={(v) => void setPreference(v)}
      />

      <Text
        style={{
          fontSize: 12,
          fontWeight: '800',
          color: theme.textMuted,
          marginTop: 16,
          letterSpacing: 0.6,
        }}
      >
        VISIÓN DEL COLOR
      </Text>
      <SettingsOptionChips
        theme={theme}
        options={VISION_OPTIONS}
        value={colorVision}
        onChange={(v) => void setColorVision(v)}
      />
      <Text
        style={{
          fontSize: 12,
          color: theme.textMuted,
          marginTop: 8,
          lineHeight: 18,
        }}
      >
        {COLOR_VISION_HINTS[colorVision]}
      </Text>
    </View>
  )
}
