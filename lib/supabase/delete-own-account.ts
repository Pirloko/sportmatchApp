import type { SupabaseClient } from '@supabase/supabase-js'

type DeleteAccountRpcResult = {
  ok?: boolean
  error?: string
}

/**
 * Elimina la cuenta autenticada vía RPC `delete_own_account` (ver scripts/delete-own-account-rpc.sql).
 */
export async function deleteOwnAccount(
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('delete_own_account')

  if (error) {
    const msg = error.message ?? ''
    if (
      msg.includes('does not exist') ||
      msg.includes('Could not find the function')
    ) {
      return {
        ok: false,
        error:
          'La eliminación de cuenta no está activa en el servidor. Ejecuta scripts/delete-own-account-rpc.sql en Supabase.',
      }
    }
    return { ok: false, error: msg || 'No se pudo eliminar la cuenta.' }
  }

  const body = data as DeleteAccountRpcResult | null
  if (!body || body.ok !== true) {
    return {
      ok: false,
      error: body?.error ?? 'No se pudo eliminar la cuenta.',
    }
  }

  return { ok: true }
}
