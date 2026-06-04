import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { useApp } from '../lib/app-provider'
import { useScreenTheme } from '../lib/theme-ui'
import {
  createVenueUserViaBackend,
  isAdminCreateVenueConfigured,
} from '../lib/supabase/admin-create-venue'
import {
  fetchAdminMetrics,
  type AdminMetrics,
  type RangeKey,
} from '../lib/supabase/admin-queries'
import { getSupabase } from '../lib/supabase/client'
import type { Gender, Level, MatchType } from '../lib/types'

const RANGE_OPTIONS: Array<{ id: RangeKey; label: string }> = [
  { id: 'day', label: 'Día' },
  { id: '7d', label: '7 días' },
  { id: '15d', label: '15 días' },
  { id: 'month', label: 'Mensual' },
  { id: 'semester', label: 'Semestral' },
  { id: 'year', label: 'Anual' },
]

export function AdminDashboardScreen() {
  const { currentUser, logout } = useApp()
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [range, setRange] = useState<RangeKey>('month')
  const [creating, setCreating] = useState(false)
  const [creatingMatch, setCreatingMatch] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    venueName: '',
    city: 'Rancagua',
    address: '',
    phone: '',
    mapsUrl: '',
  })
  const [adminMatchForm, setAdminMatchForm] = useState({
    title: '',
    city: 'Rancagua',
    venue: '',
    date: '',
    time: '',
    level: 'intermedio' as Level,
    gender: 'male' as Gender,
    type: 'open' as MatchType,
    playersNeeded: '12',
  })

  const reloadMetrics = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = getSupabase()
      const m = await fetchAdminMetrics(supabase, range)
      setMetrics(m)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar métricas'
      Alert.alert('Error', msg)
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void reloadMetrics()
  }, [reloadMetrics])

  const totalType = useMemo(() => {
    if (!metrics) return 0
    const t = metrics.byType
    return t.rival + t.players + t.open + t.reserve_only
  }, [metrics])

  const handleCreateVenueUser = async () => {
    if (!isAdminCreateVenueConfigured()) {
      Alert.alert(
        'Backend',
        'Configura EXPO_PUBLIC_ADMIN_BACKEND_URL con la URL del despliegue Next (API create-venue-user con Bearer JWT).'
      )
      return
    }
    if (!form.email.trim() || !form.password || !form.venueName.trim()) {
      Alert.alert('Completa email, clave y nombre del centro.')
      return
    }
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      Alert.alert('Sesión', 'No hay token de sesión.')
      return
    }
    setCreating(true)
    try {
      const res = await createVenueUserViaBackend(session.access_token, {
        email: form.email.trim(),
        password: form.password,
        venueName: form.venueName.trim(),
        city: form.city.trim() || 'Rancagua',
        address: form.address.trim(),
        phone: form.phone.trim(),
        mapsUrl: form.mapsUrl.trim(),
      })
      if (!res.ok) {
        Alert.alert('No se pudo crear', res.error)
        return
      }
      Alert.alert('Listo', 'Usuario centro y centro deportivo creados correctamente.')
      setForm((prev) => ({
        ...prev,
        email: '',
        password: '',
        venueName: '',
        address: '',
        phone: '',
        mapsUrl: '',
      }))
      await reloadMetrics()
    } finally {
      setCreating(false)
    }
  }

  const handleCreateAdminMatch = async () => {
    if (!currentUser || currentUser.accountType !== 'admin') return
    if (
      !adminMatchForm.city.trim() ||
      !adminMatchForm.venue.trim() ||
      !adminMatchForm.date.trim() ||
      !adminMatchForm.time.trim()
    ) {
      Alert.alert('Completa ciudad, centro, fecha y hora.')
      return
    }
    const dateTime = new Date(`${adminMatchForm.date}T${adminMatchForm.time}`)
    if (Number.isNaN(dateTime.getTime())) {
      Alert.alert('Fecha/hora inválida', 'Usa formato fecha AAAA-MM-DD y hora HH:MM.')
      return
    }
    const playersNeededParsed = Number(adminMatchForm.playersNeeded)
    const playersNeeded =
      Number.isFinite(playersNeededParsed) && playersNeededParsed > 0
        ? Math.round(playersNeededParsed)
        : null
    setCreatingMatch(true)
    try {
      const supabase = getSupabase()
      const title =
        adminMatchForm.title.trim() ||
        `Partido SportMatch ${adminMatchForm.city.trim()}`
      const { data, error } = await supabase
        .from('match_opportunities')
        .insert({
          type: adminMatchForm.type,
          title,
          description: 'Partido creado por SportMatch',
          location: adminMatchForm.city.trim(),
          venue: adminMatchForm.venue.trim(),
          date_time: dateTime.toISOString(),
          level: adminMatchForm.level,
          creator_id: currentUser.id,
          gender: adminMatchForm.gender,
          status: 'pending',
          players_needed:
            adminMatchForm.type === 'rival' ? null : (playersNeeded ?? 12),
          players_joined: 0,
        })
        .select('id')
        .single()
      if (error || !data?.id) {
        Alert.alert('No se pudo crear partido', error?.message || 'Error desconocido')
        return
      }
      Alert.alert('Listo', 'Partido admin creado como SportMatch.')
      setAdminMatchForm((prev) => ({
        ...prev,
        title: '',
        venue: '',
        date: '',
        time: '',
      }))
      await reloadMetrics()
      router.push(`/partidos/${data.id}`)
    } finally {
      setCreatingMatch(false)
    }
  }

  if (!currentUser || currentUser.accountType !== 'admin') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.restricted}>
          <Text style={styles.restrictedTitle}>Acceso restringido</Text>
          <Text style={styles.muted}>
            Este panel está disponible solo para usuarios admin.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.h1}>Panel Admin</Text>
          <Text style={styles.sub}>
            Métricas de reservas y alta de centros (backend opcional para alta).
          </Text>
        </View>
        <Pressable style={styles.btnGhost} onPress={() => void logout()}>
          <Text style={styles.btnGhostText}>Salir</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.rangeRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.rangeChips}>
                {RANGE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[styles.chip, range === opt.id && styles.chipOn]}
                    onPress={() => setRange(opt.id)}
                  >
                    <Text
                      style={[styles.chipText, range === opt.id && styles.chipTextOn]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Pressable
              style={styles.refreshBtn}
              disabled={loading}
              onPress={() => void reloadMetrics()}
            >
              <Text style={styles.refreshText}>{loading ? '…' : 'Actualizar'}</Text>
            </Pressable>
          </View>

          {loading || !metrics ? (
            <Text style={styles.muted}>Cargando métricas…</Text>
          ) : (
            <View style={styles.statsGrid}>
              <Stat label="Reservas" value={metrics.totals.reservations} />
              <Stat label="Centros" value={metrics.totals.centers} />
              <Stat label="% Confirmadas" value={`${metrics.totals.confirmRate}%`} />
              <Stat label="Autoconfirmadas" value={metrics.totals.selfConfirmed} />
              <Stat label="Pendientes" value={metrics.totals.pending} />
              <Stat label="Confirmadas" value={metrics.totals.confirmed} />
              <Stat label="Canceladas" value={metrics.totals.cancelled} />
              <Stat label="Total tipificadas" value={totalType} />
            </View>
          )}
        </View>

        {metrics ? (
          <View style={styles.card}>
            <View style={styles.twoCol}>
              <View style={styles.subCard}>
                <Text style={styles.sectionTitle}>Tipos de reserva/partido</Text>
                <TypePill label="Revuelta" value={metrics.byType.open} />
                <TypePill label="Rival vs rival" value={metrics.byType.rival} />
                <TypePill label="Yo + cinco" value={metrics.byType.players} />
                <TypePill label="Solo reserva" value={metrics.byType.reserve_only} />
              </View>
              <View style={styles.subCard}>
                <Text style={styles.sectionTitle}>Centros más reservados</Text>
                {metrics.topVenues.length === 0 ? (
                  <Text style={styles.muted}>Sin reservas todavía.</Text>
                ) : (
                  metrics.topVenues.slice(0, 5).map((v, idx) => (
                    <Text key={v.venueId} style={styles.listLine}>
                      {idx + 1}. {v.venueName} — {v.reservations} reservas
                    </Text>
                  ))
                )}
              </View>
            </View>

            <Text style={styles.sectionTitle}>
              Tabla detallada ({metrics.details.length})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.table}>
                <View style={styles.trHead}>
                  <Cell head>Fecha/Hora</Cell>
                  <Cell head>Centro</Cell>
                  <Cell head>Cancha</Cell>
                  <Cell head>Tipo</Cell>
                  <Cell head>Partido/Reserva</Cell>
                  <Cell head>Jugador</Cell>
                  <Cell head>Estado</Cell>
                  <Cell head>Confirmación</Cell>
                </View>
                {metrics.details.length === 0 ? (
                  <Text style={styles.mutedPad}>Sin reservas para este rango.</Text>
                ) : (
                  metrics.details.map((row) => (
                    <View key={row.id} style={styles.tr}>
                      <Cell>
                        {new Date(row.startsAt).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Cell>
                      <Cell>{row.venueName}</Cell>
                      <Cell>{row.courtName}</Cell>
                      <Cell>{typeLabel(row.matchType)}</Cell>
                      <Cell narrow>{row.matchTitle}</Cell>
                      <Cell>{row.bookerName}</Cell>
                      <Cell>{statusLabel(row.status)}</Cell>
                      <Cell>{confirmationLabel(row.confirmationSource)}</Cell>
                      <Cell>
                        {row.matchId ? (
                          <Pressable onPress={() => router.push(`/partidos/${row.matchId}`)}>
                            <Text style={styles.manageLink}>Gestionar</Text>
                          </Pressable>
                        ) : (
                          '-'
                        )}
                      </Cell>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Crear partido admin (SportMatch)</Text>
          <Field
            label="Título (opcional)"
            value={adminMatchForm.title}
            onChange={(v) => setAdminMatchForm((f) => ({ ...f, title: v }))}
          />
          <Field
            label="Ciudad"
            value={adminMatchForm.city}
            onChange={(v) => setAdminMatchForm((f) => ({ ...f, city: v }))}
          />
          <Field
            label="Centro / Cancha"
            value={adminMatchForm.venue}
            onChange={(v) => setAdminMatchForm((f) => ({ ...f, venue: v }))}
          />
          <View style={styles.twoCol}>
            <Field
              label="Fecha (AAAA-MM-DD)"
              value={adminMatchForm.date}
              onChange={(v) => setAdminMatchForm((f) => ({ ...f, date: v }))}
            />
            <Field
              label="Hora (HH:MM)"
              value={adminMatchForm.time}
              onChange={(v) => setAdminMatchForm((f) => ({ ...f, time: v }))}
            />
          </View>
          <Field
            label="Cupos (no rival)"
            value={adminMatchForm.playersNeeded}
            onChange={(v) => setAdminMatchForm((f) => ({ ...f, playersNeeded: v }))}
            keyboardType="phone-pad"
          />
          <View style={styles.rowPickers}>
            <PickerChip
              label="Revuelta"
              active={adminMatchForm.type === 'open'}
              onPress={() => setAdminMatchForm((f) => ({ ...f, type: 'open' }))}
            />
            <PickerChip
              label="Selección de equipos"
              active={
                adminMatchForm.type === 'team_pick_public' ||
                adminMatchForm.type === 'team_pick_private'
              }
              onPress={() =>
                setAdminMatchForm((f) => ({
                  ...f,
                  type: 'team_pick_public' as MatchType,
                }))
              }
            />
            <PickerChip
              label="Rival"
              active={adminMatchForm.type === 'rival'}
              onPress={() => setAdminMatchForm((f) => ({ ...f, type: 'rival' }))}
            />
          </View>
          <View style={styles.rowPickers}>
            <PickerChip
              label="Intermedio"
              active={adminMatchForm.level === 'intermedio'}
              onPress={() =>
                setAdminMatchForm((f) => ({ ...f, level: 'intermedio' }))
              }
            />
            <PickerChip
              label="Avanzado"
              active={adminMatchForm.level === 'avanzado'}
              onPress={() => setAdminMatchForm((f) => ({ ...f, level: 'avanzado' }))}
            />
            <PickerChip
              label="Competitivo"
              active={adminMatchForm.level === 'competitivo'}
              onPress={() =>
                setAdminMatchForm((f) => ({ ...f, level: 'competitivo' }))
              }
            />
          </View>
          <View style={styles.rowPickers}>
            <PickerChip
              label="Hombres"
              active={adminMatchForm.gender === 'male'}
              onPress={() => setAdminMatchForm((f) => ({ ...f, gender: 'male' }))}
            />
            <PickerChip
              label="Mujeres"
              active={adminMatchForm.gender === 'female'}
              onPress={() =>
                setAdminMatchForm((f) => ({ ...f, gender: 'female' }))
              }
            />
          </View>
          <Pressable
            style={[styles.btnPrimary, creatingMatch && styles.disabled]}
            disabled={creatingMatch}
            onPress={() => void handleCreateAdminMatch()}
          >
            {creatingMatch ? (
              <ActivityIndicator color={theme.primaryBtnText} />
            ) : (
              <Text style={styles.btnPrimaryText}>Crear partido admin</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Crear usuario centro deportivo</Text>
          {!isAdminCreateVenueConfigured() ? (
            <Text style={styles.warnBox}>
              Para crear usuarios desde la app, configura{' '}
              <Text style={styles.mono}>EXPO_PUBLIC_ADMIN_BACKEND_URL</Text> con la
              URL de tu backend Next (p. ej. https://tu-app.vercel.app). La ruta{' '}
              <Text style={styles.mono}>/api/admin/create-venue-user</Text> debe
              aceptar <Text style={styles.mono}>Authorization: Bearer</Text> (ya
              soportado en la referencia Next de este repo).
            </Text>
          ) : null}
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Clave"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            secureTextEntry
          />
          <Field
            label="Nombre centro"
            value={form.venueName}
            onChange={(v) => setForm((f) => ({ ...f, venueName: v }))}
          />
          <Field
            label="Ciudad"
            value={form.city}
            onChange={(v) => setForm((f) => ({ ...f, city: v }))}
          />
          <Field
            label="Dirección"
            value={form.address}
            onChange={(v) => setForm((f) => ({ ...f, address: v }))}
          />
          <Field
            label="Teléfono"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            keyboardType="phone-pad"
          />
          <Field
            label="URL Maps (opcional)"
            value={form.mapsUrl}
            onChange={(v) => setForm((f) => ({ ...f, mapsUrl: v }))}
            autoCapitalize="none"
          />
          <Pressable
            style={[styles.btnPrimary, creating && styles.disabled]}
            disabled={creating}
            onPress={() => void handleCreateVenueUser()}
          >
            {creating ? (
              <ActivityIndicator color={theme.primaryBtnText} />
            ) : (
              <Text style={styles.btnPrimaryText}>Crear usuario centro</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function useThemedStyles() {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  return { theme, styles }
}

function Cell({
  children,
  head,
  narrow,
}: {
  children: ReactNode
  head?: boolean
  narrow?: boolean
}) {
  const { styles } = useThemedStyles()
  return (
    <Text
      style={[styles.td, head && styles.th, narrow && styles.tdNarrow]}
      numberOfLines={head ? 2 : 3}
    >
      {children}
    </Text>
  )
}

function TypePill({ label, value }: { label: string; value: number }) {
  const { styles } = useThemedStyles()
  return (
    <View style={styles.typePill}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.typeVal}>{value}</Text>
    </View>
  )
}

function typeLabel(type: AdminMetrics['details'][number]['matchType']) {
  switch (type) {
    case 'open':
      return 'Revuelta'
    case 'rival':
      return 'Rival vs rival'
    case 'players':
      return 'Yo + cinco'
    default:
      return 'Solo reserva'
  }
}

function statusLabel(status: 'pending' | 'confirmed' | 'cancelled') {
  if (status === 'pending') return 'Pendiente'
  if (status === 'confirmed') return 'Confirmada'
  return 'Cancelada'
}

function confirmationLabel(
  source: 'venue_owner' | 'booker_self' | 'admin' | null
) {
  if (source === 'booker_self') return 'Organizador'
  if (source === 'venue_owner') return 'Centro'
  if (source === 'admin') return 'Admin'
  return 'Sin definir'
}

function Stat({ label, value }: { label: string; value: string | number }) {
  const { styles } = useThemedStyles()
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

function Field({
  label,
  value,
  onChange,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  secureTextEntry?: boolean
  autoCapitalize?: 'none' | 'sentences'
  keyboardType?: 'default' | 'email-address' | 'phone-pad'
}) {
  const { styles, theme } = useThemedStyles()
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        placeholderTextColor={theme.textMuted}
      />
    </View>
  )
}

function PickerChip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const { styles } = useThemedStyles()
  return (
    <Pressable style={[styles.pickChip, active && styles.pickChipOn]} onPress={onPress}>
      <Text style={[styles.pickChipText, active && styles.pickChipTextOn]}>{label}</Text>
    </Pressable>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  h1: { fontSize: 22, fontWeight: '800', color: theme.text },
  sub: { fontSize: 13, color: theme.textMuted, marginTop: 4, maxWidth: 280 },
  btnGhost: { padding: 8 },
  btnGhostText: { fontSize: 15, fontWeight: '600', color: theme.link },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: theme.chipBg,
    gap: 12,
  },
  rangeRow: { gap: 10 },
  rangeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  chipOn: {
    borderColor: theme.primary,
    backgroundColor: theme.isDark ? 'rgba(37, 99, 235, 0.2)' : 'rgba(37, 99, 235, 0.12)',
  },
  chipText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  chipTextOn: { color: theme.primary },
  refreshBtn: { alignSelf: 'flex-end', padding: 8 },
  refreshText: { color: theme.link, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    width: '47%',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: theme.card,
  },
  statLabel: { fontSize: 11, color: theme.textMuted },
  statValue: { fontSize: 18, fontWeight: '800', color: theme.text, marginTop: 2 },
  muted: { fontSize: 14, color: theme.textMuted },
  mutedPad: { padding: 12, fontSize: 13, color: theme.textMuted },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 },
  twoCol: { gap: 12 },
  subCard: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: theme.chipBg,
    gap: 8,
  },
  listLine: { fontSize: 13, color: theme.text },
  typePill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  typeVal: { fontSize: 15, fontWeight: '800', color: theme.text },
  table: { minWidth: 860, gap: 0 },
  trHead: { flexDirection: 'row', backgroundColor: theme.chipBg, paddingVertical: 6 },
  tr: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingVertical: 6,
  },
  td: { width: 108, fontSize: 11, color: theme.text, paddingHorizontal: 4 },
  tdNarrow: { width: 140 },
  th: { fontWeight: '700', color: theme.textMuted },
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: theme.text },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: theme.card,
    color: theme.text,
  },
  btnPrimary: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryText: { color: theme.primaryBtnText, fontSize: 16, fontWeight: '700' },
  manageLink: { color: theme.link, fontWeight: '700', fontSize: 12 },
  rowPickers: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pickChip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: theme.card,
  },
  pickChipOn: {
    borderColor: theme.primary,
    backgroundColor: theme.isDark ? 'rgba(37, 99, 235, 0.2)' : 'rgba(37, 99, 235, 0.1)',
  },
  pickChipText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  pickChipTextOn: { color: theme.primary },
  disabled: { opacity: 0.55 },
  restricted: { padding: 24 },
  restrictedTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  warnBox: {
    fontSize: 13,
    color: theme.isDark ? '#FCD34D' : '#92400e',
    backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.14)' : '#fffbeb',
    padding: 10,
    borderRadius: 10,
    lineHeight: 20,
  },
  mono: { fontFamily: 'monospace', fontSize: 12 },
})
}
