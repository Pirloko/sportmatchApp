import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme } from 'react-native'

import {
  applyColorVisionTokens,
  isColorVisionMode,
  type ColorVisionMode,
} from './color-vision'
import { themeTokens, type ThemeTokens } from '../src/app/theme/tokens'

const THEME_STORAGE_KEY = 'pichanga-theme'
const COLOR_VISION_STORAGE_KEY = 'pichanga-color-vision'

export type ThemePreference = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
  colorVision: ColorVisionMode
  setColorVision: (mode: ColorVisionMode) => void
  /** Tema efectivo tras aplicar `system`. */
  resolved: 'light' | 'dark'
  tokens: ThemeTokens
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [colorVision, setColorVisionState] = useState<ColorVisionMode>('normal')

  useEffect(() => {
    void (async () => {
      try {
        const [themeValue, visionValue] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(COLOR_VISION_STORAGE_KEY),
        ])
        if (themeValue === 'light' || themeValue === 'dark' || themeValue === 'system') {
          setPreferenceState(themeValue)
        }
        if (visionValue && isColorVisionMode(visionValue)) {
          setColorVisionState(visionValue)
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  const setPreference = useCallback(async (p: ThemePreference) => {
    setPreferenceState(p)
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, p)
    } catch {
      // ignore
    }
  }, [])

  const setColorVision = useCallback(async (mode: ColorVisionMode) => {
    setColorVisionState(mode)
    try {
      await AsyncStorage.setItem(COLOR_VISION_STORAGE_KEY, mode)
    } catch {
      // ignore
    }
  }, [])

  const resolved: 'light' | 'dark' =
    preference === 'system'
      ? system === 'dark'
        ? 'dark'
        : 'light'
      : preference

  const tokens = useMemo(
    () => applyColorVisionTokens(themeTokens[resolved], colorVision, resolved),
    [colorVision, resolved]
  )

  const value = useMemo(
    () => ({
      preference,
      setPreference,
      colorVision,
      setColorVision,
      resolved,
      tokens,
    }),
    [preference, setPreference, colorVision, setColorVision, resolved, tokens]
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useThemePreference debe usarse dentro de ThemeProvider')
  }
  return ctx
}
