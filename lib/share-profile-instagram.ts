import { Image as ExpoImage } from 'expo-image'
import * as Sharing from 'expo-sharing'
import { captureRef } from 'react-native-view-shot'
import type { RefObject } from 'react'
import type { View } from 'react-native'

import {
  PROFILE_SHARE_CARD_HEIGHT,
  PROFILE_SHARE_CARD_WIDTH,
  PROFILE_SHARE_EXPORT_HEIGHT,
  PROFILE_SHARE_EXPORT_WIDTH,
} from '../components/profile-share-card'

async function prefetchRemoteImages(uris: string[]): Promise<void> {
  const unique = [...new Set(uris.filter((u) => u.startsWith('http')))]
  await Promise.all(
    unique.map((uri) =>
      ExpoImage.prefetch(uri, { cachePolicy: 'memory-disk' }).catch(() => undefined)
    )
  )
}

/** Espera layout + imágenes remotas antes de capturar la tarjeta. */
export async function prepareProfileShareCapture(
  prefetchUris: string[]
): Promise<void> {
  await prefetchRemoteImages(prefetchUris)
  await new Promise((resolve) => setTimeout(resolve, 350))
}

export async function captureAndShareProfileCard(
  cardRef: RefObject<View | null>,
  options?: { prefetchUris?: string[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!cardRef.current) {
    return { ok: false, error: 'No se pudo generar la imagen.' }
  }

  try {
    if (options?.prefetchUris?.length) {
      await prepareProfileShareCapture(options.prefetchUris)
    } else {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    const uri = await captureRef(cardRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: PROFILE_SHARE_EXPORT_WIDTH,
      height: PROFILE_SHARE_EXPORT_HEIGHT,
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

/** Dimensiones lógicas de la tarjeta off-screen (9:16). */
export { PROFILE_SHARE_CARD_WIDTH, PROFILE_SHARE_CARD_HEIGHT }
