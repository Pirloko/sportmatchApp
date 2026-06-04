import { useQuery } from '@tanstack/react-query'

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchSportsVenuesList } from '@/lib/supabase/venue-owner-queries'

export function usePublicVenues() {
  return useQuery({
    queryKey: ['public-venues'],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return []
      const supabase = getSupabase()
      return fetchSportsVenuesList(supabase)
    },
    staleTime: 60_000,
  })
}
