import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  setOpenCreateAfterAuthFlag,
  writeCreatePrefill,
} from '../lib/create-prefill'
import { useApp } from '../lib/app-provider'
import { useScreenTheme } from '../lib/theme-ui'
import { BallLoadingIndicator } from './ball-loading-indicator'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import type { PublicVenuePageData } from '../lib/supabase/venue-public-queries'
import type { VenueReservationRow } from '../lib/types'
import { computeDaySlots, WEEKDAY_SHORT_ES } from '../lib/venue-slots'
import { persistPlayerLastNav, readPlayerLastNav, type PlayerNavId } from '../lib/player-nav-storage'

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function fromDateInputValue(s: string): Date {
  const [y, m, day] = s.split('-').map(Number)
  const d = new Date()
  d.setFullYear(y, m - 1, day)
  d.setHours(0, 0, 0, 0)
  return d
}

const TAB_ROUTES: Array<{ id: PlayerNavId; href: string; label: string }> = [
  { id: 'home', href: '/home', label: 'Inicio' },
  { id: 'explore', href: '/explorar', label: 'Explorar' },
  { id: 'matches', href: '/partidos', label: 'Partidos' },
  { id: 'create', href: '/crear', label: 'Crear' },
  { id: 'teams', href: '/equipos', label: 'Equipos' },
  { id: 'ranking', href: '/ranking', label: 'Ranking' },
]

type Props = {
  data: PublicVenuePageData
}

export function VenueCentroScreen({ data }: Props) {
  const { venue, courts, weeklyHours } = data
  const { currentUser } = useApp()
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const [dayStr, setDayStr] = useState(() => toDateInputValue(new Date()))
  const [reservations, setReservations] = useState<VenueReservationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [navHint, setNavHint] = useState<PlayerNavId | null>(null)

  const day = useMemo(() => fromDateInputValue(dayStr), [dayStr])

  useEffect(() => {
    void readPlayerLastNav().then(setNavHint)
  }, [])

  const loadRes = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    const supabase = getSupabase()
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)
    setLoading(true)
    try {
      const { data: rpcData, error } = await supabase.rpc(
        'venue_public_reservations_in_range',
        {
          p_venue_id: venue.id,
          p_from: start.toISOString(),
          p_to: end.toISOString(),
        }
      )
      if (error || !rpcData) {
        setReservations([])
        return
      }
      const rows = rpcData as {
        court_id: string
        starts_at: string
        ends_at: string
      }[]
      setReservations(
        rows.map((r) => ({
          id: `${r.court_id}-${r.starts_at}`,
          courtId: r.court_id,
          startsAt: new Date(r.starts_at),
          endsAt: new Date(r.ends_at),
          bookerUserId: null,
          matchOpportunityId: null,
          status: 'confirmed' as const,
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [day, venue.id])

  useEffect(() => {
    void loadRes()
  }, [loadRes])

  const courtIds = courts.map((c) => c.id)

  const slots = useMemo(
    () =>
      computeDaySlots(
        day,
        weeklyHours,
        courtIds,
        reservations,
        venue.slotDurationMinutes
      ),
    [day, weeklyHours, courtIds, reservations, venue.slotDurationMinutes]
  )

  const dow = WEEKDAY_SHORT_ES[day.getDay()]

  const handleCreateFromSlot = (slotStart: Date, slotEnd: Date) => {
    const date = toDateInputValue(slotStart)
    const time = `${pad2(slotStart.getHours())}:${pad2(slotStart.getMinutes())}`
    void writeCreatePrefill({
      sportsVenueId: venue.id,
      venueLabel: venue.name,
      city: venue.city,
      date,
      time,
      bookCourtSlot: true,
    })
    if (currentUser?.accountType === 'player') {
      router.push('/crear')
    } else {
      void setOpenCreateAfterAuthFlag()
      router.push('/')
    }
  }

  const openMaps = () => {
    if (venue.mapsUrl) void Linking.openURL(venue.mapsUrl)
  }

  const telHref = venue.phone?.replace(/\s/g, '') ?? ''

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.h1}>{venue.name}</Text>
        <Text style={styles.sub}>{venue.city}</Text>

        <View style={styles.card}>
          {venue.address ? (
            <Text style={styles.line}>📍 {venue.address}</Text>
          ) : null}
          {venue.phone ? (
            <Text style={styles.line}>
              📞{' '}
              <Text
                style={styles.link}
                onPress={() => void Linking.openURL(`tel:${telHref}`)}
              >
                {venue.phone}
              </Text>
            </Text>
          ) : null}
          {venue.mapsUrl ? (
            <Pressable onPress={openMaps}>
              <Text style={styles.link}>Ver en Google Maps</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>
            ¿Quieres organizar un partido en {venue.name}?
          </Text>
          <Text style={styles.infoBody}>
            Mira los horarios disponibles y pulsa «Crear partido aquí» en el tramo
            que te acomode. Si no tienes cuenta, regístrate primero.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Horarios disponibles ({dow})</Text>
        <Text style={styles.label}>Día (AAAA-MM-DD)</Text>
        <TextInput
          style={styles.dateInput}
          value={dayStr}
          onChangeText={setDayStr}
          placeholder="2025-03-29"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>
          Tramos de {venue.slotDurationMinutes} min según horario y reservas
          confirmadas.
        </Text>

        {loading ? (
          <BallLoadingIndicator size="sm" message="Cargando…" />
        ) : weeklyHours.length === 0 || courts.length === 0 ? (
          <Text style={styles.muted}>
            Este centro aún no tiene horario o canchas configurados en la app.
          </Text>
        ) : slots.length === 0 ? (
          <Text style={styles.muted}>
            No hay horario de apertura este día o ya no quedan tramos libres.
          </Text>
        ) : (
          slots.map((s) => {
            const free = s.freeCourtIds.length
            const label = `${pad2(s.start.getHours())}:${pad2(s.start.getMinutes())} – ${pad2(s.end.getHours())}:${pad2(s.end.getMinutes())}`
            const available = free > 0
            return (
              <View key={s.start.toISOString()} style={styles.slotCard}>
                <View style={styles.slotRow}>
                  <Text style={styles.slotTime}>🕐 {label}</Text>
                  <Text style={styles.muted}>
                    {available
                      ? `${free} cancha(s) libre(s) de ${s.totalCourts}`
                      : 'Completo'}
                  </Text>
                </View>
                {available ? (
                  <Pressable
                    style={styles.cta}
                    onPress={() => handleCreateFromSlot(s.start, s.end)}
                  >
                    <Text style={styles.ctaText}>Crear partido aquí</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          })
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        {TAB_ROUTES.map((item) => {
          const active = navHint === item.id
          return (
            <Pressable
              key={item.id}
              style={styles.navItem}
              onPress={() => {
                void persistPlayerLastNav(item.id)
                router.push(item.href as '/home' | '/explorar' | '/partidos' | '/crear' | '/equipos' | '/ranking')
              }}
            >
              <Text
                style={[styles.navLabel, active && styles.navLabelActive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </SafeAreaView>
  )
}

export function VenueCentroLoading() {
  return <BallLoadingIndicator fullScreen size="lg" />
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: 16, paddingBottom: 100 },
    back: { marginBottom: 8 },
    backText: { fontSize: 16, color: theme.link, fontWeight: '600' },
    h1: { fontSize: 24, fontWeight: '800', color: theme.text },
    sub: { fontSize: 15, color: theme.textMuted, marginTop: 4 },
    card: {
      marginTop: 16,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      gap: 8,
    },
    line: { fontSize: 15, color: theme.text },
    link: { color: theme.link, fontWeight: '600', fontSize: 15 },
    infoBox: {
      marginTop: 20,
      padding: 14,
      borderRadius: 12,
      backgroundColor: theme.chipBg,
      gap: 8,
    },
    infoTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    infoBody: { fontSize: 14, color: theme.textMuted, lineHeight: 20 },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      marginTop: 20,
      marginBottom: 8,
    },
    label: { fontSize: 13, color: theme.textMuted, marginBottom: 4 },
    dateInput: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.inputBg,
      color: theme.text,
    },
    hint: { fontSize: 12, color: theme.textMuted, marginTop: 8, marginBottom: 12 },
    muted: { fontSize: 14, color: theme.textMuted },
    slotCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      backgroundColor: theme.card,
    },
    slotRow: { gap: 4, marginBottom: 8 },
    slotTime: { fontSize: 16, fontWeight: '700', color: theme.text },
    cta: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    ctaText: { color: theme.primaryBtnText, fontWeight: '700', fontSize: 15 },
    bottomNav: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingBottom: 8,
      paddingTop: 6,
      backgroundColor: theme.card,
    },
    navItem: { flex: 1, alignItems: 'center', paddingVertical: 6 },
    navLabel: { fontSize: 9, color: theme.textMuted, fontWeight: '600' },
    navLabelActive: { color: theme.primary },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  })
}
