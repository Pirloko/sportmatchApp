import { useMemo } from 'react'

import type { ThemeTokens } from '../src/app/theme/tokens'
import { useThemePreference } from './theme-context'

/** Colores derivados para pantallas (claro / oscuro). */
export type ScreenTheme = {
  tokens: ThemeTokens
  resolved: 'light' | 'dark'
  isDark: boolean
  bg: string
  card: string
  cardElevated: string
  border: string
  text: string
  textMuted: string
  primary: string
  accent: string
  danger: string
  success: string
  inputBg: string
  inputBorder: string
  overlay: string
  chipBg: string
  chipBorder: string
  skeleton: string
  tabInactive: string
  primaryBtnText: string
  link: string
  /** Fondo de fila/chip seleccionado (primary suave). */
  selectedTint: string
  /** Borde superior de bottom sheet en oscuro. */
  modalSheetTopBorder: string
  /** Icono/texto verde legible sobre fondos tintados (solo oscuro). */
  primaryAccent: string
  statWinBg: string
  statDrawBg: string
  statLossBg: string
  logoBoxBg: string
  logoBoxBorder: string
  dangerSurface: string
  dangerOnSurface: string
  accentOnSurface: string
}

export function buildScreenTheme(
  tokens: ThemeTokens,
  resolved: 'light' | 'dark'
): ScreenTheme {
  const isDark = resolved === 'dark'
  return {
    tokens,
    resolved,
    isDark,
    bg: tokens.background,
    card: tokens.card,
    cardElevated: isDark ? '#22262E' : '#FFFFFF',
    border: tokens.border,
    text: tokens.foreground,
    textMuted: tokens.mutedForeground,
    primary: tokens.primary,
    accent: tokens.accent,
    danger: tokens.destructive,
    success: tokens.success,
    inputBg: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
    inputBorder: tokens.border,
    overlay: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.45)',
    chipBg: isDark ? 'rgba(255,255,255,0.06)' : tokens.secondary,
    chipBorder: tokens.border,
    skeleton: isDark ? 'rgba(255,255,255,0.08)' : tokens.muted,
    tabInactive: isDark ? 'rgba(255,255,255,0.06)' : tokens.secondary,
    primaryBtnText: isDark ? '#0F1115' : '#FFFFFF',
    link: isDark ? '#86EFAC' : tokens.primary,
    selectedTint: isDark
      ? 'rgba(102, 208, 111, 0.18)'
      : 'rgba(15, 69, 57, 0.08)',
    modalSheetTopBorder: isDark
      ? 'rgba(102, 208, 111, 0.35)'
      : tokens.border,
    primaryAccent: isDark ? '#86EFAC' : tokens.primary,
    statWinBg: isDark
      ? 'rgba(102, 208, 111, 0.14)'
      : 'rgba(47, 158, 68, 0.12)',
    statDrawBg: isDark
      ? 'rgba(251, 191, 36, 0.14)'
      : 'rgba(245, 158, 11, 0.14)',
    statLossBg: isDark
      ? 'rgba(248, 113, 113, 0.14)'
      : 'rgba(239, 68, 68, 0.1)',
    logoBoxBg: isDark
      ? 'rgba(102, 208, 111, 0.12)'
      : 'rgba(47, 158, 68, 0.12)',
    logoBoxBorder: isDark
      ? 'rgba(102, 208, 111, 0.28)'
      : 'rgba(47, 158, 68, 0.22)',
    dangerSurface: isDark
      ? 'rgba(248, 113, 113, 0.16)'
      : 'rgba(239, 68, 68, 0.12)',
    dangerOnSurface: isDark ? '#FCA5A5' : tokens.destructive,
    accentOnSurface: isDark ? '#FCD34D' : '#CA8A04',
  }
}

export function useScreenTheme(): ScreenTheme {
  const { tokens, resolved } = useThemePreference()
  return useMemo(() => buildScreenTheme(tokens, resolved), [tokens, resolved])
}

/** Opciones de header Stack/Tabs con tema SportMatch. */
export function navigationThemeOptions(theme: ScreenTheme) {
  return {
    headerStyle: { backgroundColor: theme.card },
    headerTintColor: theme.primary,
    headerTitleStyle: {
      color: theme.text,
      fontWeight: '700' as const,
      fontSize: 17,
    },
    headerShadowVisible: !theme.isDark,
    contentStyle: { backgroundColor: theme.bg },
  }
}
