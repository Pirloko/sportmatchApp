const MIN_AGE = 17
const WHATSAPP_DIGITS = 8

export function ageFromBirthDate(birthDate: Date): number {
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1
  }
  return age
}

export function defaultBirthDateForMinAge(): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - MIN_AGE)
  return d
}

export function formatBirthDateDisplay(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function birthDateToIso(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function normalizeWhatsappDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(-WHATSAPP_DIGITS)
}

export function buildWhatsappE164(digits8: string): string {
  const d = normalizeWhatsappDigits(digits8)
  return d.length === WHATSAPP_DIGITS ? `+569${d}` : ''
}

export function isValidWhatsappDigits(digits8: string): boolean {
  return normalizeWhatsappDigits(digits8).length === WHATSAPP_DIGITS
}

export function isValidBirthDateForMinAge(birthDate: Date): boolean {
  if (Number.isNaN(birthDate.getTime())) return false
  if (birthDate > new Date()) return false
  return ageFromBirthDate(birthDate) >= MIN_AGE
}

export function isRealProfilePhoto(photo: string): boolean {
  const t = photo.trim()
  if (!t) return false
  if (t.startsWith('http://') || t.startsWith('https://')) return true
  return false
}

export { MIN_AGE, WHATSAPP_DIGITS }
