import * as Sharing from 'expo-sharing'
import { captureRef } from 'react-native-view-shot'
import type { RefObject } from 'react'
import type { View } from 'react-native'

import {
  PROFILE_SHARE_CARD_HEIGHT,
  PROFILE_SHARE_CARD_WIDTH,
} from '../components/profile-share-card'

export async function captureAndShareProfileCard(
  cardRef: RefObject<View | null>
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!cardRef.current) {
    return { ok: false, error: 'No se pudo generar la imagen.' }
  }

  try {
    const uri = await captureRef(cardRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: PROFILE_SHARE_CARD_WIDTH,
      height: PROFILE_SHARE_CARD_HEIGHT,
    })

    const available = await Sharing.isAvailableAsync()
    if (!available) {
      return { ok: false, error: 'Compartir no está disponible en este dispositivo.' }
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Compartir perfil',
      UTI: 'public.png',
    })

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al compartir.'
    return { ok: false, error: msg }
  }
}
