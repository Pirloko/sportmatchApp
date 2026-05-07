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
import { themeTokens, type ThemeTokens } from '../src/app/theme/tokens'

const STORAGE_KEY = 'pichanga-theme'

export type ThemePreference = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
  /** Tema efectivo tras aplicar `system`. */
  resolved: 'light' | 'dark'
  tokens: ThemeTokens
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    void (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY)
        if (v === 'light' || v === 'dark' || v === 'system') {
          setPreferenceState(v)
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  const setPreference = useCallback(async (p: ThemePreference) => {
    setPreferenceState(p)
    try {
      await AsyncStorage.setItem(STORAGE_KEY, p)
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

  const value = useMemo(
    () => ({
      preference,
      setPreference,
      resolved,
      tokens: themeTokens[resolved],
    }),
    [preference, setPreference, resolved]
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
