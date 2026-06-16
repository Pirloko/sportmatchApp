import type { ThemeTokens } from '../src/app/theme/tokens'

/** Modo de visión del color para paletas accesibles. */
export type ColorVisionMode = 'normal' | 'redGreen' | 'blueYellow'

export const COLOR_VISION_LABELS: Record<ColorVisionMode, string> = {
  normal: 'Normal',
  redGreen: 'Rojo–verde',
  blueYellow: 'Azul–amarillo',
}

export const COLOR_VISION_HINTS: Record<ColorVisionMode, string> = {
  normal: 'Colores originales de SportMatch.',
  redGreen: 'Ideal para protanopia y deuteranopia. Victoria en azul, alertas en naranja.',
  blueYellow: 'Ideal para tritanopia. Ajusta acentos amarillos y azules.',
}

export function isColorVisionMode(value: string): value is ColorVisionMode {
  return value === 'normal' || value === 'redGreen' || value === 'blueYellow'
}

/** Ajusta tokens semánticos para distinguir mejor estados críticos. */
export function applyColorVisionTokens(
  tokens: ThemeTokens,
  mode: ColorVisionMode,
  resolved: 'light' | 'dark'
): ThemeTokens {
  if (mode === 'normal') return tokens

  if (mode === 'redGreen') {
    return {
      ...tokens,
      primary: resolved === 'dark' ? '#93C5FD' : '#1D4ED8',
      success: resolved === 'dark' ? '#60A5FA' : '#2563EB',
      destructive: resolved === 'dark' ? '#FB923C' : '#C2410C',
      warning: resolved === 'dark' ? '#FBBF24' : '#D97706',
      primaryGreen: resolved === 'dark' ? '#93C5FD' : '#1D4ED8',
      danger: resolved === 'dark' ? '#FB923C' : '#C2410C',
    }
  }

  return {
    ...tokens,
    primary: resolved === 'dark' ? '#5EEAD4' : '#0F766E',
    accent: resolved === 'dark' ? '#F472B6' : '#DB2777',
    success: resolved === 'dark' ? '#2DD4BF' : '#0D9488',
    warning: resolved === 'dark' ? '#C4B5FD' : '#7C3AED',
    destructive: resolved === 'dark' ? '#FB7185' : '#E11D48',
    accentGold: resolved === 'dark' ? '#F472B6' : '#DB2777',
    danger: resolved === 'dark' ? '#FB7185' : '#E11D48',
  }
}
