import type { SupabaseClient } from '@supabase/supabase-js'

import { mapLeaveMatchRpcError } from '../match-leave-reasons'

export type LeaveMatchOpportunityResult =
  | { ok: true }
  | { ok: false; error: string }

export async function leaveMatchOpportunityWithReason(
  supabase: SupabaseClient,
  opportunityId: string,
  reason: string
): Promise<LeaveMatchOpportunityResult> {
  const trimmed = reason.trim()
  const { data, error } = await supabase.rpc('leave_match_opportunity_with_reason', {
    p_opportunity_id: opportunityId,
    p_reason: trimmed,
  })

  if (
    !error &&
    data &&
    typeof data === 'object' &&
    (data as { ok?: boolean }).ok === true
  ) {
    return { ok: true }
  }

  const code =
    data &&
    typeof data === 'object' &&
    typeof (data as { error?: string }).error === 'string'
      ? (data as { error: string }).error
      : null

  if (code) {
    return { ok: false, error: mapLeaveMatchRpcError(code) }
  }

  if (error?.message?.includes('Could not find the function')) {
    return {
      ok: false,
      error:
        'La función de salida no está activa en Supabase (leave_match_opportunity_with_reason).',
    }
  }

  return { ok: false, error: error?.message ?? mapLeaveMatchRpcError(null) }
}
