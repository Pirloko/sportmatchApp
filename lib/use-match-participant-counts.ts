import { useEffect, useState } from 'react'

import { createClient, isSupabaseConfigured } from './supabase/client'

export type ParticipantCounts = {
  gkCount: number
  fieldCount: number
  joinedCount: number
  loading: boolean
}

/**
 * Conteos en vivo desde `match_opportunity_participants` (pending + confirmed).
 */
export function useMatchParticipantCounts(
  opportunityId: string | undefined,
  open: boolean
): ParticipantCounts {
  const [gkCount, setGkCount] = useState(0)
  const [fieldCount, setFieldCount] = useState(0)
  const [joinedCount, setJoinedCount] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !opportunityId || !isSupabaseConfigured()) {
      setGkCount(0)
      setFieldCount(0)
      setJoinedCount(0)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const sb = createClient()
        const { data, error } = await sb
          .from('match_opportunity_participants')
          .select('is_goalkeeper, status')
          .eq('opportunity_id', opportunityId)
        if (error || cancelled) return
        let gk = 0
        let field = 0
        let joined = 0
        for (const p of data ?? []) {
          const st = p.status as string
          if (st !== 'pending' && st !== 'confirmed') continue
          joined++
          if (p.is_goalkeeper === true) gk++
          else field++
        }
        if (!cancelled) {
          setGkCount(gk)
          setFieldCount(field)
          setJoinedCount(joined)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, opportunityId])

  return { gkCount, fieldCount, joinedCount, loading }
}
