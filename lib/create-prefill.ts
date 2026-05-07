import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  CREATE_PREFILL_STORAGE_KEY,
  OPEN_CREATE_AFTER_AUTH_KEY,
} from './storage-keys'

export type CreatePrefillPayload = {
  sportsVenueId: string
  venueLabel: string
  city: string
  date: string
  time: string
  bookCourtSlot: boolean
}

export async function writeCreatePrefill(payload: CreatePrefillPayload) {
  try {
    await AsyncStorage.setItem(
      CREATE_PREFILL_STORAGE_KEY,
      JSON.stringify(payload)
    )
  } catch {
    // ignore
  }
}

export async function readCreatePrefill(): Promise<CreatePrefillPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(CREATE_PREFILL_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as CreatePrefillPayload
    if (!o.sportsVenueId || !o.date || !o.time) return null
    return o
  } catch {
    return null
  }
}

export async function clearCreatePrefill() {
  try {
    await AsyncStorage.removeItem(CREATE_PREFILL_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Tras elegir slot en página pública: si el usuario no está logueado, abrir auth y luego Crear. */
export async function setOpenCreateAfterAuthFlag() {
  try {
    await AsyncStorage.setItem(OPEN_CREATE_AFTER_AUTH_KEY, '1')
  } catch {
    // ignore
  }
}
