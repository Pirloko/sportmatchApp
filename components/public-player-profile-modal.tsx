import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Image } from 'expo-image'
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

import { levelLabel } from '../lib/format-match'
import {
  formatAvailabilityDay,
  levelBadgeColors,
  organizerProgress,
  positionLabel,
  sortAvailabilityDays,
} from '../lib/player-profile-ui'
import {
  fetchPublicPlayerProfile,
  PLAYER_REPORT_CATEGORIES,
  submitPlayerReport,
  type PlayerReportCategoryId,
  type PublicPlayerProfile,
} from '../lib/supabase/public-player-profile'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import { useScreenTheme } from '../lib/theme-ui'

type PublicPlayerProfileModalProps = {
  visible: boolean
  userId: string | null
  currentUserId?: string | null
  contextType?: string
  contextId?: string
  onClose: () => void
}

export function PublicPlayerProfileModal({
  visible,
  userId,
  currentUserId,
  contextType = 'match',
  contextId,
  onClose,
}: PublicPlayerProfileModalProps) {
  const theme = useScreenTheme()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState<PlayerReportCategoryId>('conducta')
  const [reportDetails, setReportDetails] = useState('')
  const [reportBusy, setReportBusy] = useState(false)

  const resetReportForm = useCallback(() => {
    setReportOpen(false)
    setReportCategory('conducta')
    setReportDetails('')
  }, [])

  const loadProfile = useCallback(async (id: string) => {
    if (!isSupabaseConfigured()) {
      setError('Supabase no configurado.')
      setProfile(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const client = getSupabase()
      const res = await fetchPublicPlayerProfile(client, id)
      if (res.error || !res.profile) {
        setError(res.error ?? 'No se pudo cargar el perfil.')
        setProfile(null)
      } else {
        setProfile(res.profile)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!visible || !userId) {
      setProfile(null)
      setError(null)
      setReportOpen(false)
      resetReportForm()
      return
    }
    void loadProfile(userId)
  }, [visible, userId, loadProfile, resetReportForm])

  const availability = useMemo(
    () => sortAvailabilityDays(profile?.availability ?? []),
    [profile?.availability]
  )

  const orgTier = useMemo(
    () => organizerProgress(profile?.statsOrganizedCompleted ?? 0),
    [profile?.statsOrganizedCompleted]
  )

  const canReport =
    !!currentUserId &&
    !!profile &&
    profile.id !== currentUserId &&
    isSupabaseConfigured()

  const onSubmitReport = async () => {
    if (!profile || !currentUserId || !canReport) return
    setReportBusy(true)
    try {
      const client = getSupabase()
      const res = await submitPlayerReport(client, {
        reporterId: currentUserId,
        reportedUserId: profile.id,
        category: reportCategory,
        details: reportDetails,
        contextType,
        contextId,
      })
      if (!res.ok) {
        Alert.alert('No se pudo enviar', res.error ?? 'Intenta de nuevo.')
        return
      }
      Alert.alert(
        'Reporte enviado',
        'Los reportes llegan al equipo admin para revisión.'
      )
      resetReportForm()
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Perfil del jugador
          </Text>
          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: theme.chipBg }]}
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="close" size={22} color={theme.primary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>
              Cargando perfil…
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
            {userId ? (
              <Pressable
                style={[styles.retryBtn, { backgroundColor: theme.primary }]}
                onPress={() => void loadProfile(userId)}
              >
                <Text style={[styles.retryBtnText, { color: theme.primaryBtnText }]}>
                  Reintentar
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : profile ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Image source={{ uri: profile.photo }} style={styles.avatar} contentFit="cover" />
              <Text style={[styles.name, { color: theme.text }]}>{profile.name}</Text>
              <View
                style={[
                  styles.levelBadge,
                  levelBadgeColors(profile.level, theme.isDark),
                ]}
              >
                <Text style={[styles.levelBadgeText, { color: theme.text }]}>
                  {levelLabel(profile.level)}
                </Text>
              </View>
              <Text style={[styles.metaRow, { color: theme.textMuted }]}>
                📍 {profile.city}
              </Text>
              <Text style={[styles.position, { color: theme.primary }]}>
                {positionLabel(profile.position)}
              </Text>
            </View>

            <ProfileSection title="Estadísticas del jugador" icon="trophy-outline" theme={theme}>
              <View style={styles.statRow}>
                <StatCell label="Victorias" value={profile.statsPlayerWins} theme={theme} tone="win" />
                <StatCell label="Empates" value={profile.statsPlayerDraws} theme={theme} tone="draw" />
                <StatCell label="Derrotas" value={profile.statsPlayerLosses} theme={theme} tone="loss" />
              </View>
            </ProfileSection>

            {availability.length > 0 ? (
              <ProfileSection title="Disponibilidad" icon="calendar-outline" theme={theme}>
                <View style={styles.chipRow}>
                  {availability.map((day) => (
                    <View
                      key={day}
                      style={[
                        styles.availChip,
                        {
                          backgroundColor: theme.selectedTint,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.availChipText, { color: theme.primary }]}>
                        {formatAvailabilityDay(day)}
                      </Text>
                    </View>
                  ))}
                </View>
              </ProfileSection>
            ) : null}

            <ProfileSection title="Organización de partidos" icon="shield-checkmark-outline" theme={theme}>
              <View
                style={[
                  styles.orgCard,
                  { backgroundColor: theme.cardElevated, borderColor: theme.border },
                ]}
              >
                <View style={styles.orgTop}>
                  <View>
                    <Text style={[styles.orgNum, { color: theme.text }]}>
                      {profile.statsOrganizedCompleted}
                    </Text>
                    <Text style={[styles.orgSub, { color: theme.textMuted }]}>
                      Partidos organizados finalizados
                    </Text>
                  </View>
                  <Text style={[styles.orgTier, { color: theme.primary }]}>
                    {orgTier.label}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.skeleton }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(orgTier.progress * 100)}%`,
                        backgroundColor: theme.primary,
                      },
                    ]}
                  />
                </View>
                {orgTier.nextLabel ? (
                  <Text style={[styles.orgNext, { color: theme.textMuted }]}>
                    Siguiente: {orgTier.nextLabel}
                  </Text>
                ) : null}
                <Text style={[styles.orgFooter, { color: theme.text }]}>
                  Victorias al organizar: {profile.statsOrganizerWins}
                </Text>
              </View>
            </ProfileSection>

            <ProfileSection
              title="Historial de amonestaciones por reportes"
              icon="shield-outline"
              theme={theme}
            >
              <View style={styles.modRow}>
                <ModCard
                  title="Amarillas"
                  value={profile.modYellowCards}
                  hint="Acumuladas en cuenta"
                  tone="yellow"
                  theme={theme}
                />
                <ModCard
                  title="Rojas"
                  value={profile.modRedCards}
                  hint="Acumuladas en cuenta"
                  tone="red"
                  theme={theme}
                />
              </View>
            </ProfileSection>

            {canReport ? (
              <ProfileSection title="Reportar" icon="flag-outline" theme={theme} iconColor={theme.danger}>
                {!reportOpen ? (
                  <>
                    <Pressable
                      style={[styles.reportBtn, { backgroundColor: theme.dangerSurface }]}
                      onPress={() => setReportOpen(true)}
                    >
                      <Text style={[styles.reportBtnText, { color: theme.dangerOnSurface }]}>
                        Reportar jugador
                      </Text>
                    </Pressable>
                    <Text style={[styles.reportHint, { color: theme.textMuted }]}>
                      Los reportes llegan al equipo admin para revisión.
                    </Text>
                  </>
                ) : (
                  <View
                    style={[
                      styles.reportForm,
                      { backgroundColor: theme.cardElevated, borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.reportFormHead}>
                      <View style={styles.reportFormTitleRow}>
                        <Ionicons name="flag" size={16} color={theme.danger} />
                        <Text style={[styles.reportFormTitle, { color: theme.text }]}>
                          Reportar
                        </Text>
                      </View>
                      <Pressable
                        onPress={resetReportForm}
                        style={[
                          styles.reportFormCancelBtn,
                          { backgroundColor: theme.dangerSurface },
                        ]}
                      >
                        <Text style={[styles.reportFormCancelText, { color: theme.dangerOnSurface }]}>
                          Cancelar
                        </Text>
                      </Pressable>
                    </View>

                    <View style={styles.reportCategoryGrid}>
                      {PLAYER_REPORT_CATEGORIES.map((category) => {
                        const selected = reportCategory === category.id
                        return (
                          <Pressable
                            key={category.id}
                            style={[
                              styles.reportCategoryBtn,
                              selected
                                ? { backgroundColor: theme.primary }
                                : {
                                    backgroundColor: theme.chipBg,
                                    borderColor: theme.border,
                                    borderWidth: 1,
                                  },
                            ]}
                            onPress={() => setReportCategory(category.id)}
                          >
                            <Text
                              style={[
                                styles.reportCategoryText,
                                {
                                  color: selected ? theme.primaryBtnText : theme.text,
                                },
                              ]}
                            >
                              {category.label}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>

                    <TextInput
                      style={[
                        styles.reportInput,
                        {
                          color: theme.text,
                          borderColor: theme.inputBorder,
                          backgroundColor: theme.inputBg,
                        },
                      ]}
                      placeholder="Describe brevemente qué ocurrió (opcional)."
                      placeholderTextColor={theme.textMuted}
                      value={reportDetails}
                      onChangeText={setReportDetails}
                      multiline
                      maxLength={500}
                    />

                    <Pressable
                      style={[
                        styles.reportSendFull,
                        { backgroundColor: theme.primary },
                        reportBusy && { opacity: 0.6 },
                      ]}
                      disabled={reportBusy}
                      onPress={() => void onSubmitReport()}
                    >
                      {reportBusy ? (
                        <ActivityIndicator color={theme.primaryBtnText} size="small" />
                      ) : (
                        <Text style={[styles.reportSendFullText, { color: theme.primaryBtnText }]}>
                          Enviar reporte
                        </Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </ProfileSection>
            ) : null}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  )
}

function ProfileSection({
  title,
  icon,
  iconColor,
  theme,
  children,
}: {
  title: string
  icon: ComponentProps<typeof Ionicons>['name']
  iconColor?: string
  theme: ReturnType<typeof useScreenTheme>
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={18} color={iconColor ?? theme.primaryAccent} />
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

function StatCell({
  label,
  value,
  theme,
  tone,
}: {
  label: string
  value: number
  theme: ReturnType<typeof useScreenTheme>
  tone: 'win' | 'draw' | 'loss'
}) {
  const bg =
    tone === 'win'
      ? theme.statWinBg
      : tone === 'draw'
        ? theme.statDrawBg
        : theme.statLossBg
  return (
    <View style={[styles.statCell, { backgroundColor: bg, borderColor: theme.border }]}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  )
}

function ModCard({
  title,
  value,
  hint,
  tone,
  theme,
}: {
  title: string
  value: number
  hint: string
  tone: 'yellow' | 'red'
  theme: ReturnType<typeof useScreenTheme>
}) {
  const border = tone === 'yellow' ? '#EAB308' : theme.danger
  return (
    <View style={[styles.modCard, { borderColor: border, backgroundColor: theme.card }]}>
      <Ionicons
        name="warning"
        size={18}
        color={tone === 'yellow' ? '#EAB308' : theme.danger}
      />
      <Text style={[styles.modValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.modTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.modHint, { color: theme.textMuted }]}>{hint}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: { marginTop: 12, fontSize: 15 },
  errorText: { fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtnText: { fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 32 },
  heroCard: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
  },
  levelBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  levelBadgeText: { fontSize: 12, fontWeight: '700' },
  metaRow: { fontSize: 14, marginTop: 8 },
  position: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  section: { marginTop: 20 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  statRow: { flexDirection: 'row', gap: 8 },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  availChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  availChipText: { fontSize: 12, fontWeight: '700' },
  orgCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  orgTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  orgNum: { fontSize: 24, fontWeight: '800' },
  orgSub: { fontSize: 12, marginTop: 2, maxWidth: 180 },
  orgTier: { fontSize: 12, fontWeight: '700', textAlign: 'right', flex: 1 },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999 },
  orgNext: { fontSize: 11, marginTop: 8 },
  orgFooter: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  modRow: { flexDirection: 'row', gap: 8 },
  modCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  modValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  modTitle: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  modHint: { fontSize: 10, marginTop: 4, textAlign: 'center' },
  reportBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  reportBtnText: { fontSize: 15, fontWeight: '700' },
  reportHint: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  reportForm: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  reportFormHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reportFormTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportFormTitle: { fontSize: 16, fontWeight: '800' },
  reportFormCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  reportFormCancelText: { fontSize: 13, fontWeight: '700' },
  reportCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  reportCategoryBtn: {
    width: '47%',
    flexGrow: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCategoryText: { fontSize: 14, fontWeight: '700' },
  reportInput: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
  },
  reportSendFull: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSendFullText: { fontSize: 16, fontWeight: '800' },
})
