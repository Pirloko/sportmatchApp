import type { SupabaseClient } from '@supabase/supabase-js'

export type GeoCountry = { id: string; name: string; isoCode: string }
export type GeoRegion = { id: string; name: string; countryId: string; code: string }
export type GeoCity = { id: string; name: string; regionId: string }

export async function fetchGeoCountries(
  supabase: SupabaseClient
): Promise<GeoCountry[]> {
  const { data, error } = await supabase
    .from('geo_countries')
    .select('id, name, iso_code')
    .eq('is_active', true)
    .order('name')

  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    isoCode: r.iso_code as string,
  }))
}

export async function fetchGeoRegions(
  supabase: SupabaseClient,
  countryId: string
): Promise<GeoRegion[]> {
  const { data, error } = await supabase
    .from('geo_regions')
    .select('id, name, country_id, code')
    .eq('country_id', countryId)
    .eq('is_active', true)
    .order('name')

  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    countryId: r.country_id as string,
    code: r.code as string,
  }))
}

export async function fetchGeoCities(
  supabase: SupabaseClient,
  regionId: string
): Promise<GeoCity[]> {
  const { data, error } = await supabase
    .from('geo_cities')
    .select('id, name, region_id')
    .eq('region_id', regionId)
    .eq('is_active', true)
    .order('name')

  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    regionId: r.region_id as string,
  }))
}
