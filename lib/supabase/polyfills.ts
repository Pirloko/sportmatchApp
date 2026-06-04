/**
 * Carga ANTES de Supabase (instrumentation.ts).
 * PKCE S256 en Hermes sin react-native-quick-crypto (evita crash al arranque en APK).
 */
import 'react-native-get-random-values'

import * as ExpoCrypto from 'expo-crypto'
import { Platform } from 'react-native'

function toDigestInput(data: ArrayBuffer | ArrayBufferView): BufferSource {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data) as Uint8Array<ArrayBuffer>
  }
  const view = data as ArrayBufferView
  return new Uint8Array(
    view.buffer as ArrayBuffer,
    view.byteOffset,
    view.byteLength
  )
}

function ensureSubtleDigest(): void {
  const g = globalThis as typeof globalThis & {
    crypto?: Crypto & { subtle?: SubtleCrypto }
  }

  const prior = g.crypto
  const priorSubtle = prior?.subtle
  if (priorSubtle && typeof priorSubtle.digest === 'function') {
    return
  }

  const digestImpl: SubtleCrypto['digest'] = async (algorithm, data) => {
    const name =
      typeof algorithm === 'string'
        ? algorithm
        : (algorithm as Algorithm).name
    if (name !== 'SHA-256') {
      throw new Error(`crypto.subtle.digest: algoritmo no soportado (${name})`)
    }
    return ExpoCrypto.digest(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      toDigestInput(data)
    )
  }

  const subtle = {
    ...(priorSubtle ?? {}),
    digest: digestImpl,
  } as SubtleCrypto

  g.crypto = {
    ...(prior ?? {}),
    subtle,
  } as Crypto
}

if (Platform.OS !== 'web') {
  ensureSubtleDigest()
}
