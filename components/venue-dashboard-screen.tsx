import * as Clipboard from 'expo-clipboard'
import * as Linking from 'expo-linking'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useApp } from '../lib/app-provider'
import { useScreenTheme } from '../lib/theme-ui'
import { BallLoadingIndicator } from './ball-loading-indicator'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import {
  fetchVenueCourts,
  fetchVenueForOwner,
  fetchVenueReservationsRange,
  fetchVenueWeeklyHours,
} from '../lib/supabase/venue-owner-queries'
import type {
  SportsVenue,
  VenueCourt,
  VenueReservationRow,
  VenueWeeklyHour,
} from '../lib/types'
import { WEEKDAY_SHORT_ES } from '../lib/venue-slots'

type DayHours = { open: string; close: string } | null

function toPgTime(hhmm: string): string {
  const x = hhmm.trim()
  if (/^\d{1,2}:\d{2}$/.test(x)) {
    const [h, m] = x.split(':')
    return `${h.padStart(2, '0')}:${m}:00`
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(x)) return x
  return `${x}:00`
}

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function publicUrlForVenue(venueId: string): string {
  const path = `/centro/${venueId}`
  const site =
    typeof process !== 'undefined' &&
    process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (site) return `${site}${path}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return Linking.createURL(path)
}

export function VenueDashboardScreen() {
  const { currentUser, logout, deleteAccount } = useApp()
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const [tab, setTab] = useState<'bookings' | 'profile' | 'courts' | 'hours'>(
    'bookings'
  )
  const [venue, setVenue] = useState<SportsVenue | null>(null)
  const [courts, setCourts] = useState<VenueCourt[]>([])
  const [weeklyLoaded, setWeeklyLoaded] = useState<VenueWeeklyHour[]>([])
  const [loading, setLoading] = useState(true)
  const [dayStr, setDayStr] = useState(() => toDateInputValue(new Date()))
  const [reservations, setReservations] = useState<
    Awaited<ReturnType<typeof fetchVenueReservationsRange>>
  >([])
  const [matchById, setMatchById] = useState<
    Map<string, { id: string; title: string; creatorId: string }>
  >(new Map())
  const [organizerById, setOrganizerById] = useState<
    Map<string, { id: string; name: string; whatsappPhone: string | null }>
  >(new Map())

  const [profileForm, setProfileForm] = useState({
    name: '',
    address: '',
    mapsUrl: '',
    phone: '',
    city: '',
    slotDurationMinutes: 60,
  })

  const [hoursByDay, setHoursByDay] = useState<Record<number, DayHours>>(() => {
    const o: Record<number, DayHours> = {}
    for (let d = 0; d <= 6; d++) o[d] = null
    return o
  })

  const [newCourtName, setNewCourtName] = useState('')
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualForm, setManualForm] = useState({
    courtId: '',
    time: '20:00',
    durationMinutes: 60,
    clientName: '',
    clientPhone: '',
    status: 'pending' as 'pending' | 'confirmed',
    note: '',
  })

  const [cancelModal, setCancelModal] = useState<{ id: string } | null>(null)
  const [cancelReason, setCancelReason] = useState(
    'No se recibió el pago a tiempo'
  )

  const reloadAll = useCallback(async () => {
    if (!currentUser || !isSupabaseConfigured()) return
    const supabase = getSupabase()
    const v = await fetchVenueForOwner(supabase, currentUser.id)
    setVenue(v)
    if (!v) {
      setCourts([])
      setWeeklyLoaded([])
      return
    }
    const [cList, wList] = await Promise.all([
      fetchVenueCourts(supabase, v.id),
      fetchVenueWeeklyHours(supabase, v.id),
    ])
    setCourts(cList)
    setWeeklyLoaded(wList)
    setProfileForm({
      name: v.name,
      address: v.address,
      mapsUrl: v.mapsUrl ?? '',
      phone: v.phone,
      city: v.city,
      slotDurationMinutes: v.slotDurationMinutes,
    })
    const hb: Record<number, DayHours> = {}
    for (let d = 0; d <= 6; d++) hb[d] = null
    for (const h of wList) {
      hb[h.dayOfWeek] = { open: h.openTime, close: h.closeTime }
    }
    setHoursByDay(hb)
  }, [currentUser])

  useEffect(() => {
    let ok = true
    void (async () => {
      setLoading(true)
      await reloadAll()
      if (ok) setLoading(false)
    })()
    return () => {
      ok = false
    }
  }, [reloadAll])

  useEffect(() => {
    if (!venue || !isSupabaseConfigured()) return
    const supabase = getSupabase()
    const d = new Date(dayStr + 'T12:00:00')
    const start = new Date(d)
    start.setHours(0, 0, 0, 0)
    const end = new Date(d)
    end.setHours(23, 59, 59, 999)
    let cancelled = false
    void (async () => {
      const list = await fetchVenueReservationsRange(
        supabase,
        venue.id,
        start.toISOString(),
        end.toISOString()
      )
      if (cancelled) return
      setReservations(list)

      const matchIds = [
        ...new Set((list ?? []).map((r) => r.matchOpportunityId).filter(Boolean)),
      ] as string[]
      const mMap = new Map<
        string,
        { id: string; title: string; creatorId: string }
      >()
      const contactIds = new Set<string>()
      const fallbackBookerIds = new Set<string>()
      for (const r of list ?? []) {
        if (r.bookerUserId) fallbackBookerIds.add(r.bookerUserId)
      }

      if (matchIds.length > 0) {
        const { data: matches } = await supabase
          .from('match_opportunities')
          .select('id, title, creator_id')
          .in('id', matchIds)
        for (const m of matches ?? []) {
          const id = m.id as string
          const creatorId = m.creator_id as string
          contactIds.add(creatorId)
          mMap.set(id, { id, title: (m.title as string) ?? 'Partido', creatorId })
        }
      }
      setMatchById(mMap)

      for (const id of fallbackBookerIds) contactIds.add(id)
      if (contactIds.size === 0) {
        setOrganizerById(new Map())
        return
      }
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, name, whatsapp_phone')
        .in('id', [...contactIds])
      const pMap = new Map<
        string,
        { id: string; name: string; whatsappPhone: string | null }
      >()
      for (const p of profs ?? []) {
        pMap.set(p.id as string, {
          id: p.id as string,
          name: (p.name as string) ?? 'Organizador',
          whatsappPhone: (p.whatsapp_phone as string | null) ?? null,
        })
      }
      setOrganizerById(pMap)
    })()
    return () => {
      cancelled = true
    }
  }, [venue, dayStr])

  const formatWhatsAppLink = (raw: string, message: string) => {
    const digits = raw.replace(/\D/g, '')
    const text = encodeURIComponent(message)
    return `https://wa.me/${digits}?text=${text}`
  }

  const setReservationPayment = async (
    reservationId: string,
    payload: Record<string, unknown>
  ) => {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('venue_reservations')
      .update(payload)
      .eq('id', reservationId)
    if (error) {
      Alert.alert('Error', error.message)
      return false
    }
    return true
  }

  const confirmReservation = (id: string) => {
    Alert.alert(
      'Confirmar reserva',
      '¿Confirmar esta reserva? (pago recibido)',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí',
          onPress: () => void doConfirm(id),
        },
      ]
    )
  }

  const doConfirm = async (id: string) => {
    const ok = await setReservationPayment(id, {
      status: 'confirmed',
      payment_status: 'paid',
      confirmation_source: 'venue_owner',
      confirmed_by_user_id: currentUser?.id ?? null,
      confirmation_note: 'Confirmada por centro deportivo',
    })
    if (!ok) return
    Alert.alert('Listo', 'Reserva confirmada')
    await reloadAll()
  }

  const cancelReservation = (id: string) => {
    setCancelReason('No se recibió el pago a tiempo')
    setCancelModal({ id })
  }

  const submitCancel = async () => {
    if (!cancelModal) return
    const reason = cancelReason.trim()
    if (!reason) {
      Alert.alert('Indica un motivo')
      return
    }
    const ok = await setReservationPayment(cancelModal.id, {
      status: 'cancelled',
      cancelled_reason: reason,
    })
    if (!ok) return
    setCancelModal(null)
    Alert.alert('Listo', 'Reserva cancelada')
    await reloadAll()
  }

  const createManualReservation = async () => {
    if (!venue || !isSupabaseConfigured()) return
    if (!manualForm.courtId) {
      Alert.alert('Error', 'Selecciona una cancha para la reserva manual.')
      return
    }
    if (!/^\d{2}:\d{2}$/.test(manualForm.time.trim())) {
      Alert.alert('Error', 'Ingresa una hora válida en formato HH:MM.')
      return
    }
    if (manualForm.durationMinutes < 30 || manualForm.durationMinutes > 240) {
      Alert.alert('Error', 'La duración debe estar entre 30 y 240 minutos.')
      return
    }
    const startsAt = new Date(`${dayStr}T${manualForm.time}:00`)
    if (Number.isNaN(startsAt.getTime())) {
      Alert.alert('Error', 'Fecha u hora inválida.')
      return
    }
    const endsAt = new Date(
      startsAt.getTime() + manualForm.durationMinutes * 60 * 1000
    )
    const now = new Date()
    if (startsAt.getTime() < now.getTime() - 5 * 60 * 1000) {
      Alert.alert('Error', 'No puedes crear reservas manuales en el pasado.')
      return
    }

    setManualSaving(true)
    try {
      const noteParts = [
        'manual_reservation',
        manualForm.clientName.trim() ? `cliente:${manualForm.clientName.trim()}` : '',
        manualForm.clientPhone.trim()
          ? `telefono:${manualForm.clientPhone.trim()}`
          : '',
        manualForm.note.trim() ? `nota:${manualForm.note.trim()}` : '',
      ].filter(Boolean)
      const notes = noteParts.join(' | ')
      const payload: Record<string, unknown> = {
        court_id: manualForm.courtId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: manualForm.status,
        payment_status: manualForm.status === 'confirmed' ? 'paid' : 'unpaid',
        notes,
        booker_user_id: null,
        match_opportunity_id: null,
        confirmation_source: manualForm.status === 'confirmed' ? 'venue_owner' : null,
        confirmed_by_user_id:
          manualForm.status === 'confirmed' ? currentUser?.id ?? null : null,
        confirmation_note:
          manualForm.status === 'confirmed'
            ? 'Reserva manual confirmada por centro'
            : 'Reserva manual cargada por centro',
      }
      const supabase = getSupabase()
      const { error } = await supabase.from('venue_reservations').insert(payload)
      if (error) {
        if (error.message.includes('venue_reservation_overlap')) {
          Alert.alert('Error', 'Ese horario ya está ocupado en esta cancha.')
        } else {
          Alert.alert('Error', error.message)
        }
        return
      }
      Alert.alert('Listo', 'Reserva manual creada correctamente.')
      setManualForm((f) => ({
        ...f,
        courtId: f.courtId,
        clientName: '',
        clientPhone: '',
        note: '',
      }))
      await reloadAll()
      setDayStr(toDateInputValue(startsAt))
    } finally {
      setManualSaving(false)
    }
  }

  const courtNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of courts) m.set(c.id, c.name)
    return m
  }, [courts])

  const saveProfile = async () => {
    if (!venue) return
    const supabase = getSupabase()
    const { error } = await supabase
      .from('sports_venues')
      .update({
        name: profileForm.name.trim(),
        address: profileForm.address.trim(),
        maps_url: profileForm.mapsUrl.trim() || null,
        phone: profileForm.phone.trim(),
        city: profileForm.city.trim() || 'Rancagua',
        slot_duration_minutes: Math.min(
          180,
          Math.max(15, Math.round(profileForm.slotDurationMinutes) || 60)
        ),
      })
      .eq('id', venue.id)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    Alert.alert('Listo', 'Centro actualizado')
    await reloadAll()
  }

  const addCourt = async () => {
    if (!venue || !newCourtName.trim()) return
    const supabase = getSupabase()
    const nextOrder =
      courts.length > 0 ? Math.max(...courts.map((c) => c.sortOrder)) + 1 : 0
    const { error } = await supabase.from('venue_courts').insert({
      venue_id: venue.id,
      name: newCourtName.trim(),
      sort_order: nextOrder,
    })
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setNewCourtName('')
    Alert.alert('Listo', 'Cancha agregada')
    await reloadAll()
  }

  const removeCourt = (id: string) => {
    Alert.alert(
      'Eliminar cancha',
      '¿Eliminar esta cancha? Se borrarán sus reservas.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí',
          style: 'destructive',
          onPress: () => void doRemoveCourt(id),
        },
      ]
    )
  }

  const doRemoveCourt = async (id: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.from('venue_courts').delete().eq('id', id)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    Alert.alert('Listo', 'Cancha eliminada')
    await reloadAll()
  }

  const saveHours = async () => {
    if (!venue) return
    const supabase = getSupabase()
    for (let d = 0; d <= 6; d++) {
      const cfg = hoursByDay[d]
      const existing = weeklyLoaded.find((h) => h.dayOfWeek === d)
      if (!cfg) {
        if (existing) {
          const { error } = await supabase
            .from('venue_weekly_hours')
            .delete()
            .eq('id', existing.id)
          if (error) {
            Alert.alert('Error', error.message)
            return
          }
        }
      } else {
        const ot = toPgTime(cfg.open)
        const ct = toPgTime(cfg.close)
        if (existing) {
          const { error } = await supabase
            .from('venue_weekly_hours')
            .update({
              open_time: ot,
              close_time: ct,
            })
            .eq('id', existing.id)
          if (error) {
            Alert.alert('Error', error.message)
            return
          }
        } else {
          const { error } = await supabase.from('venue_weekly_hours').insert({
            venue_id: venue.id,
            day_of_week: d,
            open_time: ot,
            close_time: ct,
          })
          if (error) {
            Alert.alert('Error', error.message)
            return
          }
        }
      }
    }
    Alert.alert('Listo', 'Horario guardado')
    await reloadAll()
  }

  const copyPublicLink = async () => {
    if (!venue) return
    const full = publicUrlForVenue(venue.id)
    try {
      await Clipboard.setStringAsync(full)
      Alert.alert('Copiado', full)
    } catch {
      Alert.alert('Enlace', full)
    }
  }

  const onDeleteAccountPress = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción eliminará tu cuenta y datos asociados y no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmar eliminación',
              '¿Estás seguro? Se eliminará tu centro y reservas vinculadas a tu cuenta.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar mi cuenta',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      const res = await deleteAccount()
                      if (!res.ok) {
                        Alert.alert(
                          'No se pudo eliminar la cuenta',
                          res.error ?? 'Inténtalo más tarde.'
                        )
                      }
                    })()
                  },
                },
              ]
            )
          },
        },
      ]
    )
  }

  if (!currentUser) return null

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.h1} numberOfLines={1}>
            {venue?.name ?? 'Mi centro'}
          </Text>
          <Text style={styles.sub}>Cuenta centro deportivo</Text>
        </View>
        <Pressable style={styles.btnGhost} onPress={() => void logout()}>
          <Text style={styles.btnGhostText}>Salir</Text>
        </Pressable>
      </View>

      {loading ? (
        <BallLoadingIndicator fullScreen size="lg" />
      ) : !venue ? (
        <ScrollView contentContainerStyle={styles.emptyPad}>
          <Text style={styles.emptyTitle}>Aún no hay centro vinculado</Text>
          <Text style={styles.emptyBody}>
            Los centros se crean en Supabase (tabla sports_venues) con owner_id
            igual a tu usuario. Si completaste el alta en la app y no ves datos,
            revisa que la cuenta sea account_type = venue.
          </Text>
          <Pressable style={styles.btnOutline} onPress={() => void logout()}>
            <Text style={styles.btnOutlineText}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabs}
            contentContainerStyle={styles.tabsContent}
          >
            {(
              [
                ['bookings', 'Reservas'],
                ['profile', 'Perfil'],
                ['courts', 'Canchas'],
                ['hours', 'Horario'],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                style={[styles.tab, tab === id && styles.tabOn]}
                onPress={() => setTab(id)}
              >
                <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView
            style={styles.main}
            contentContainerStyle={styles.mainContent}
            keyboardShouldPersistTaps="handled"
          >
            {tab === 'bookings' && (
              <View style={styles.section}>
                <Text style={styles.label}>Día (AAAA-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={dayStr}
                  onChangeText={setDayStr}
                  placeholder="2025-03-29"
                  autoCapitalize="none"
                />
                <Pressable style={styles.btnOutline} onPress={() => void copyPublicLink()}>
                  <Text style={styles.btnOutlineText}>Copiar página pública</Text>
                </Pressable>
                <Pressable
                  style={styles.btnOutline}
                  onPress={() => setShowManualForm((v) => !v)}
                >
                  <Text style={styles.btnOutlineText}>
                    {showManualForm ? 'Ocultar reserva manual' : 'Nueva reserva manual'}
                  </Text>
                </Pressable>

                {showManualForm ? (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                      Ingresar reserva manual (cliente externo)
                    </Text>
                    <Text style={styles.labelSmall}>Cancha</Text>
                    <View style={styles.chipRow}>
                      {courts.map((c) => (
                        <Pressable
                          key={c.id}
                          style={[
                            styles.chip,
                            manualForm.courtId === c.id && styles.chipOn,
                          ]}
                          onPress={() =>
                            setManualForm((f) => ({ ...f, courtId: c.id }))
                          }
                        >
                          <Text
                            style={[
                              styles.chipText,
                              manualForm.courtId === c.id && styles.chipTextOn,
                            ]}
                          >
                            {c.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.labelSmall}>Hora (HH:MM)</Text>
                    <TextInput
                      style={styles.input}
                      value={manualForm.time}
                      onChangeText={(time) =>
                        setManualForm((f) => ({ ...f, time }))
                      }
                      placeholder="20:00"
                    />
                    <Text style={styles.labelSmall}>Duración (min)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      value={String(manualForm.durationMinutes)}
                      onChangeText={(t) =>
                        setManualForm((f) => ({
                          ...f,
                          durationMinutes: Number(t || 60),
                        }))
                      }
                    />
                    <Text style={styles.labelSmall}>Estado inicial</Text>
                    <View style={styles.chipRow}>
                      {(['pending', 'confirmed'] as const).map((s) => (
                        <Pressable
                          key={s}
                          style={[
                            styles.chip,
                            manualForm.status === s && styles.chipOn,
                          ]}
                          onPress={() =>
                            setManualForm((f) => ({ ...f, status: s }))
                          }
                        >
                          <Text
                            style={[
                              styles.chipText,
                              manualForm.status === s && styles.chipTextOn,
                            ]}
                          >
                            {s === 'pending' ? 'Pendiente' : 'Confirmada'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.labelSmall}>Nombre cliente</Text>
                    <TextInput
                      style={styles.input}
                      value={manualForm.clientName}
                      onChangeText={(clientName) =>
                        setManualForm((f) => ({ ...f, clientName }))
                      }
                    />
                    <Text style={styles.labelSmall}>WhatsApp cliente</Text>
                    <TextInput
                      style={styles.input}
                      value={manualForm.clientPhone}
                      onChangeText={(clientPhone) =>
                        setManualForm((f) => ({ ...f, clientPhone }))
                      }
                      placeholder="+56912345678"
                      keyboardType="phone-pad"
                    />
                    <Text style={styles.labelSmall}>Nota (opcional)</Text>
                    <TextInput
                      style={styles.input}
                      value={manualForm.note}
                      onChangeText={(note) =>
                        setManualForm((f) => ({ ...f, note }))
                      }
                    />
                    <Pressable
                      style={[styles.btnPrimary, manualSaving && styles.disabled]}
                      disabled={manualSaving}
                      onPress={() => void createManualReservation()}
                    >
                      {manualSaving ? (
                        <ActivityIndicator color={theme.primaryBtnText} />
                      ) : (
                        <Text style={styles.btnPrimaryText}>Guardar reserva manual</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}

                {reservations.filter((r) => r.status !== 'cancelled').length ===
                0 ? (
                  <Text style={styles.muted}>No hay reservas este día.</Text>
                ) : (
                  reservations
                    .filter((r) => r.status !== 'cancelled')
                    .map((r) => (
                      <ReservationCard
                        key={r.id}
                        r={r}
                        courtName={courtNameById.get(r.courtId) ?? 'Cancha'}
                        venueName={venue.name}
                        matchById={matchById}
                        organizerById={organizerById}
                        formatWhatsAppLink={formatWhatsAppLink}
                        onConfirm={() => confirmReservation(r.id)}
                        onCancel={() => cancelReservation(r.id)}
                      />
                    ))
                )}
              </View>
            )}

            {tab === 'profile' && (
              <View style={styles.section}>
                <Field
                  label="Nombre del centro"
                  value={profileForm.name}
                  onChange={(name) => setProfileForm({ ...profileForm, name })}
                />
                <Field
                  label="Dirección"
                  value={profileForm.address}
                  onChange={(address) =>
                    setProfileForm({ ...profileForm, address })
                  }
                />
                <Field
                  label="Enlace Google Maps"
                  value={profileForm.mapsUrl}
                  onChange={(mapsUrl) =>
                    setProfileForm({ ...profileForm, mapsUrl })
                  }
                  placeholder="https://maps.app.goo.gl/..."
                />
                <Field
                  label="Teléfono"
                  value={profileForm.phone}
                  onChange={(phone) => setProfileForm({ ...profileForm, phone })}
                  keyboardType="phone-pad"
                />
                <Field
                  label="Ciudad"
                  value={profileForm.city}
                  onChange={(city) => setProfileForm({ ...profileForm, city })}
                />
                <Text style={styles.label}>Duración de tramo (min)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={String(profileForm.slotDurationMinutes)}
                  onChangeText={(t) =>
                    setProfileForm({
                      ...profileForm,
                      slotDurationMinutes: Number(t || 60),
                    })
                  }
                />
                <Pressable style={styles.btnPrimary} onPress={() => void saveProfile()}>
                  <Text style={styles.btnPrimaryText}>Guardar</Text>
                </Pressable>
                <Pressable style={styles.btnDangerOutline} onPress={onDeleteAccountPress}>
                  <Text style={styles.danger}>Eliminar mi cuenta</Text>
                </Pressable>
              </View>
            )}

            {tab === 'courts' && (
              <View style={styles.section}>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.flex1]}
                    placeholder="Nombre cancha"
                    value={newCourtName}
                    onChangeText={setNewCourtName}
                  />
                  <Pressable style={styles.btnPrimary} onPress={() => void addCourt()}>
                    <Text style={styles.btnPrimaryText}>Agregar</Text>
                  </Pressable>
                </View>
                {courts.map((c) => (
                  <View key={c.id} style={styles.courtRow}>
                    <Text style={styles.courtName}>{c.name}</Text>
                    <Pressable onPress={() => removeCourt(c.id)}>
                      <Text style={styles.danger}>Eliminar</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {tab === 'hours' && (
              <View style={styles.section}>
                <Text style={styles.hint}>
                  0 = domingo · 6 = sábado. Pulsa “Abrir” o deja cerrado.
                </Text>
                {([0, 1, 2, 3, 4, 5, 6] as const).map((d) => (
                  <View key={d} style={styles.card}>
                    <Text style={styles.dayTitle}>{WEEKDAY_SHORT_ES[d]}</Text>
                    {hoursByDay[d] ? (
                      <View style={styles.row}>
                        <TextInput
                          style={[styles.input, styles.flex1]}
                          placeholder="09:00"
                          value={hoursByDay[d]!.open}
                          onChangeText={(open) =>
                            setHoursByDay({
                              ...hoursByDay,
                              [d]: {
                                open,
                                close: hoursByDay[d]!.close,
                              },
                            })
                          }
                        />
                        <TextInput
                          style={[styles.input, styles.flex1]}
                          placeholder="22:00"
                          value={hoursByDay[d]!.close}
                          onChangeText={(close) =>
                            setHoursByDay({
                              ...hoursByDay,
                              [d]: {
                                open: hoursByDay[d]!.open,
                                close,
                              },
                            })
                          }
                        />
                      </View>
                    ) : null}
                    <Pressable
                      style={styles.btnOutline}
                      onPress={() =>
                        setHoursByDay({
                          ...hoursByDay,
                          [d]: hoursByDay[d]
                            ? null
                            : { open: '09:00', close: '22:00' },
                        })
                      }
                    >
                      <Text style={styles.btnOutlineText}>
                        {hoursByDay[d] ? 'Cerrado este día' : 'Abrir este día'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable style={styles.btnPrimary} onPress={() => void saveHours()}>
                  <Text style={styles.btnPrimaryText}>Guardar horario</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </>
      )}

      <Modal visible={cancelModal !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Motivo de cancelación</Text>
            <Text style={styles.hint}>
              El organizador lo verá en su historial.
            </Text>
            <TextInput
              style={[styles.input, styles.modalInput]}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCancelModal(null)}>
                <Text style={styles.btnGhostText}>Volver</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={() => void submitCancel()}>
                <Text style={styles.btnPrimaryText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function useThemedStyles() {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return { theme, styles }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'phone-pad'
}) {
  const { styles, theme } = useThemedStyles()
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
      />
    </>
  )
}

function ReservationCard({
  r,
  courtName,
  venueName,
  matchById,
  organizerById,
  formatWhatsAppLink,
  onConfirm,
  onCancel,
}: {
  r: VenueReservationRow
  courtName: string
  venueName: string
  matchById: Map<string, { id: string; title: string; creatorId: string }>
  organizerById: Map<
    string,
    { id: string; name: string; whatsappPhone: string | null }
  >
  formatWhatsAppLink: (raw: string, message: string) => string
  onConfirm: () => void
  onCancel: () => void
}) {
  const { styles } = useThemedStyles()
  const m = r.matchOpportunityId ? matchById.get(r.matchOpportunityId) : undefined
  const org = m
    ? organizerById.get(m.creatorId)
    : r.bookerUserId
      ? organizerById.get(r.bookerUserId)
      : null
  const wa = org?.whatsappPhone?.trim() || null
  const timeLabel = r.startsAt.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const dateLabel = r.startsAt.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const msg = m
    ? `Hola ${org?.name ?? ''}. Soy el centro deportivo ${venueName}. Para confirmar la reserva del partido “${m.title}” (${timeLabel}), con fecha ${dateLabel}, necesitamos el abono/pago. ¿Te envío los datos para transferir o link de pago?`
    : `Hola ${org?.name ?? ''}. Soy el centro deportivo ${venueName}. Para confirmar tu reserva (${timeLabel}) del día ${dateLabel}, necesitamos el abono/pago. ¿Te envío los datos para transferir o link de pago?`

  const showContact = !!(r.matchOpportunityId || r.bookerUserId)

  return (
    <View style={styles.resCard}>
      <Text style={styles.resCourt}>{courtName}</Text>
      <Text style={styles.resTime}>
        {timeLabel} –{' '}
        {r.endsAt.toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
      {showContact ? (
        <View style={styles.resMeta}>
          <Text style={styles.resTitle}>
            {m
              ? m.title
              : r.matchOpportunityId
                ? `Partido #${r.matchOpportunityId.slice(0, 8)}…`
                : 'Reserva directa'}
          </Text>
          {r.notes?.includes('manual_reservation') ? (
            <Text style={styles.manualTag}>Reserva manual (cliente externo)</Text>
          ) : null}
          <Text style={styles.mutedSmall}>
            {m ? 'Organizador' : 'Reservante'}:{' '}
            <Text style={styles.strong}>{org?.name?.trim() || 'Sin nombre'}</Text>
          </Text>
          <Text style={styles.mutedSmall}>
            Estado:{' '}
            <Text style={styles.strong}>
              {r.status === 'pending' ? 'Pendiente' : 'Confirmada'}
            </Text>
          </Text>
          {wa ? (
            <Pressable
              style={styles.waBtn}
              onPress={() =>
                void Linking.openURL(formatWhatsAppLink(wa, msg))
              }
            >
              <Text style={styles.waBtnText}>
                {m ? 'WhatsApp al organizador' : 'WhatsApp al reservante'}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.mutedSmall}>
              {m
                ? 'El organizador no tiene WhatsApp registrado.'
                : 'El reservante no tiene WhatsApp registrado.'}
            </Text>
          )}
        </View>
      ) : null}
      <View style={styles.resActions}>
        {r.status === 'pending' ? (
          <Pressable style={styles.btnPrimarySm} onPress={onConfirm}>
            <Text style={styles.btnPrimaryText}>Confirmar (pagado)</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.btnOutlineSm} onPress={onCancel}>
          <Text style={styles.btnOutlineText}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  headerText: { flex: 1, marginRight: 12 },
  h1: { fontSize: 18, fontWeight: '800', color: theme.text },
  sub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  btnGhost: { padding: 8 },
  btnGhostText: { fontSize: 15, fontWeight: '600', color: theme.link },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyPad: { padding: 20, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  emptyBody: { fontSize: 14, color: theme.textMuted, lineHeight: 20 },
  tabs: { maxHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  tabsContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 6 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.chipBg,
    marginRight: 6,
  },
  tabOn: { backgroundColor: theme.primary },
  tabText: { fontSize: 16, fontWeight: '700', color: theme.textMuted },
  tabTextOn: { color: theme.primaryBtnText },
  main: { flex: 1 },
  mainContent: { padding: 16, paddingBottom: 40 },
  section: { gap: 12 },
  label: { fontSize: 14, fontWeight: '600', color: theme.text },
  labelSmall: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: theme.text,
    backgroundColor: theme.chipBg,
  },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  btnPrimary: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimarySm: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  btnPrimaryText: { color: theme.primaryBtnText, fontSize: 16, fontWeight: '700' },
  btnOutline: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  btnOutlineSm: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  btnOutlineText: { color: theme.text, fontWeight: '600', fontSize: 14 },
  btnDangerOutline: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.45)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: theme.chipBg,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  chipOn: {
    borderColor: theme.primary,
    backgroundColor: theme.isDark ? 'rgba(37, 99, 235, 0.2)' : 'rgba(37, 99, 235, 0.08)',
  },
  chipText: { fontSize: 14, color: theme.text },
  chipTextOn: { fontWeight: '700', color: theme.link },
  muted: { fontSize: 14, color: theme.textMuted },
  mutedSmall: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
  hint: { fontSize: 12, color: theme.textMuted, lineHeight: 18 },
  courtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  courtName: { fontSize: 15, fontWeight: '600', color: theme.text },
  danger: { color: theme.danger, fontWeight: '600' },
  dayTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 4 },
  resCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: theme.card,
  },
  resCourt: { fontSize: 16, fontWeight: '700', color: theme.text },
  resTime: { fontSize: 14, color: theme.textMuted },
  resMeta: { marginTop: 4, gap: 4 },
  resTitle: { fontSize: 13, fontWeight: '600', color: theme.link },
  manualTag: { fontSize: 11, color: theme.isDark ? '#FBBF24' : '#b45309', fontWeight: '600' },
  strong: { fontWeight: '700', color: theme.text },
  waBtn: {
    marginTop: 6,
    backgroundColor: theme.success,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  waBtnText: { color: theme.primaryBtnText, fontWeight: '700', fontSize: 14 },
  resActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  modalInput: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 8,
  },
})
}
