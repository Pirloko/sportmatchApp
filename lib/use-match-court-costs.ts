import { useEffect, useMemo, useState } from 'react'

import type { MatchCourtCost } from './match-court-cost'
import { getSupabase, isSupabaseConfigured } from './supabase/client'
import { fetchMatchCourtCostsBatch } from './supabase/match-court-cost-queries'
import type { MatchOpportunity } from './types'

export function useMatchCourtCosts(
  matches: MatchOpportunity[]
): Map<string, MatchCourtCost> {
  const [costs, setCosts] = useState<Map<string, MatchCourtCost>>(new Map())

  const cacheKey = useMemo(
    () =>
      matches
        .map(
          (m) =>
            `${m.id}:${m.sportsVenueId ?? ''}:${m.venueReservationId ?? ''}:${m.playersNeeded ?? 0}`
        )
        .join('|'),
    [matches]
  )

  useEffect(() => {
    if (!isSupabaseConfigured() || matches.length === 0) {
      setCosts(new Map())
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const map = await fetchMatchCourtCostsBatch(getSupabase(), matches)
        if (!cancelled) setCosts(map)
      } catch {
        if (!cancelled) setCosts(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cacheKey, matches])

  return costs
}
