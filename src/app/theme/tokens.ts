/**
 * Paleta SportMatch: neutros fríos (hue ~250), marca verde (~142), acento ámbar (~55).
 * Valores en HEX (derivados de OKLCH en diseño). Los aliases legacy mantienen compatibilidad con pantallas existentes.
 */
export type ThemeTokens = {
  background: string
  foreground: string
  card: string
  primary: string
  secondary: string
  muted: string
  mutedForeground: string
  accent: string
  destructive: string
  border: string
  warning: string
  success: string
  /** @deprecated usar `primary` */
  primaryGreen: string
  /** @deprecated usar `accent` */
  accentGold: string
  /** @deprecated usar `background` (nombre histórico: se usa en claro y oscuro) */
  bgDark: string
  /** @deprecated usar `card` */
  cardDark: string
  /** @deprecated usar `foreground` */
  textPrimary: string
  /** @deprecated usar `mutedForeground` */
  textMuted: string
  /** @deprecated usar `border` */
  borderDark: string
  /** @deprecated usar `destructive` */
  danger: string
}

type SemanticPalette = {
  background: string
  foreground: string
  card: string
  primary: string
  secondary: string
  muted: string
  mutedForeground: string
  accent: string
  destructive: string
  border: string
  warning: string
  success: string
}

function withLegacyAliases(s: SemanticPalette): ThemeTokens {
  return {
    ...s,
    primaryGreen: s.primary,
    accentGold: s.accent,
    bgDark: s.background,
    cardDark: s.card,
    textPrimary: s.foreground,
    textMuted: s.mutedForeground,
    borderDark: s.border,
    danger: s.destructive,
  }
}

const lightSemantic: SemanticPalette = {
  background: '#F8F9FA',
  foreground: '#1C1E21',
  card: '#FFFFFF',
  primary: '#0F4539',
  secondary: '#ECEEF1',
  muted: '#E2E5E9',
  mutedForeground: '#6B7280',
  accent: '#D97B35',
  destructive: '#DC2626',
  border: '#D1D5DB',
  warning: '#EAB308',
  success: '#16A34A',
}

const darkSemantic: SemanticPalette = {
  background: '#0F1115',
  foreground: '#FAFAFA',
  card: '#1A1D23',
  primary: '#0F4539',
  secondary: '#2A2E35',
  muted: '#333840',
  mutedForeground: '#9CA3AF',
  accent: '#F59E0B',
  destructive: '#EF4444',
  border: '#3B4049',
  warning: '#FACC15',
  success: '#22C55E',
}

export const themeTokens = {
  light: withLegacyAliases(lightSemantic),
  dark: withLegacyAliases(darkSemantic),
} satisfies Record<'light' | 'dark', ThemeTokens>
