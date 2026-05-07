/** Bloques de 1 h (09:00–23:00). Valor HH:mm en 24 h. */

function labelForHour24(h: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h < 12) return `${pad(h)}:00 a. m.`
  if (h === 12) return '12:00 p. m.'
  return `${pad(h - 12)}:00 p. m.`
}

export const TIME_SLOT_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = []
  for (let h = 9; h <= 23; h++) {
    out.push({
      value: `${String(h).padStart(2, '0')}:00`,
      label: labelForHour24(h),
    })
  }
  return out
})()
