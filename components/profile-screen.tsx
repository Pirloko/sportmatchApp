import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { Link, router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { takeAndroidPendingImageAsset } from '../lib/android-image-picker-pending'
import { levelLabel } from '../lib/format-match'
import { useApp } from '../lib/app-provider'
import { captureAndShareProfileCard } from '../lib/share-profile-instagram'
import { useScreenTheme } from '../lib/theme-ui'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import { fetchPlayerMvpWinsCount } from '../lib/supabase/mvp-queries'
import { DEFAULT_AVATAR } from '../lib/supabase/mappers'
import {
  isPlaceholderAvatarUrl,
  resolveTeamLogoDisplayUrl,
} from '../lib/supabase/team-logos'
import type { Level } from '../lib/types'
import { AppFeedbackModal } from './app-feedback-modal'
import { SettingsAboutPanel } from './settings-about-panel'
import { SettingsAppearancePanel } from './settings-appearance-panel'
import { SettingsNotificationsPanel } from './settings-notifications-panel'
import { ProfileShareCard, type ProfileShareCardData } from './profile-share-card'

const DAY_ORDER = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const

function formatDayLabel(day: string): string {
  const map: Record<string, string> = {
    lunes: 'Lun',
    martes: 'Mar',
    miercoles: 'Mié',
    jueves: 'Jue',
    viernes: 'Vie',
    sabado: 'Sáb',
    domingo: 'Dom',
  }
  return map[day.toLowerCase()] ?? day
}

function buildShareTeamRoleLine(
  team: {
    captainId: string
    viceCaptainId?: string | null
    members: { id: string; position: string }[]
  },
  userId: string,
  fallbackPosition: string
): string {
  const parts: string[] = []
  if (team.captainId === userId) parts.push('Capitán')
  else if (team.viceCaptainId === userId) parts.push('Vicecapitán')

  const member = team.members.find((m) => m.id === userId)
  const pos = member?.position ?? fallbackPosition
  const posLabel = positionLabel(pos)
  if (posLabel) parts.push(posLabel)

  return parts.length > 0 ? parts.join(' · ') : 'Jugador'
}

function positionLabel(p: string): string {
  switch (p) {
    case 'portero':
      return 'Portero'
    case 'defensa':
      return 'Defensa'
    case 'mediocampista':
      return 'Mediocampista'
    case 'delantero':
      return 'Delantero'
    default:
      return p
  }
}

const LIGHT_BADGE = {
  blue: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  primary: {
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderColor: 'rgba(37, 99, 235, 0.35)',
  },
  teal: {
    backgroundColor: 'rgba(8, 145, 178, 0.12)',
    borderColor: 'rgba(8, 145, 178, 0.35)',
  },
  red: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderColor: 'rgba(220, 38, 38, 0.35)',
  },
} as const

function resolveLightBadge(
  key: keyof typeof LIGHT_BADGE,
  theme: ReturnType<typeof useScreenTheme>
): { backgroundColor: string; borderColor: string } {
  return LIGHT_BADGE[key]
}

function levelBadgeStyle(
  level: Level | undefined,
  theme: ReturnType<typeof useScreenTheme>
): object {
  if (theme.isDark) {
    switch (level) {
      case 'principiante':
        return {
          backgroundColor: 'rgba(59, 130, 246, 0.22)',
          borderColor: 'rgba(96, 165, 250, 0.5)',
        }
      case 'intermedio':
        return {
          backgroundColor: 'rgba(37, 99, 235, 0.22)',
          borderColor: 'rgba(96, 165, 250, 0.5)',
        }
      case 'avanzado':
        return {
          backgroundColor: 'rgba(8, 145, 178, 0.22)',
          borderColor: 'rgba(34, 211, 238, 0.45)',
        }
      case 'competitivo':
        return {
          backgroundColor: 'rgba(220, 38, 38, 0.2)',
          borderColor: 'rgba(248, 113, 113, 0.5)',
        }
      default:
        return {
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderColor: 'rgba(148, 163, 184, 0.35)',
        }
    }
  }
  switch (level) {
    case 'principiante':
      return resolveLightBadge('blue', theme)
    case 'intermedio':
      return resolveLightBadge('primary', theme)
    case 'avanzado':
      return resolveLightBadge('teal', theme)
    case 'competitivo':
      return resolveLightBadge('red', theme)
    default:
      return {
        backgroundColor: theme.chipBg,
        borderColor: theme.border,
      }
  }
}

function posAgeBadgeStyle(theme: ReturnType<typeof useScreenTheme>): object {
  return theme.isDark
    ? {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: theme.border,
      }
    : {
        backgroundColor: theme.chipBg,
        borderColor: theme.border,
      }
}

/** Progreso de “nivel organizador” según partidos finalizados como creador. */
function organizerProgress(completed: number): {
  label: string
  nextLabel: string | null
  progress: number
} {
  if (completed >= 40) {
    return { label: 'Organizador estrella', nextLabel: null, progress: 1 }
  }
  if (completed >= 15) {
    return {
      label: 'Organizador referente',
      nextLabel: 'Organizador estrella',
      progress: Math.min(1, (completed - 15) / 25),
    }
  }
  if (completed >= 5) {
    return {
      label: 'Organizador activo',
      nextLabel: 'Organizador referente',
      progress: Math.min(1, (completed - 5) / 10),
    }
  }
  return {
    label: 'Organizador en práctica',
    nextLabel: 'Organizador activo',
    progress: Math.min(1, completed / 5),
  }
}

export function ProfileScreen() {
  const {
    currentUser,
    logout,
    deleteAccount,
    openProfileEditor,
    matchOpportunities,
    getUserTeams,
    updateProfilePhoto,
  } = useApp()
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [photoWorking, setPhotoWorking] = useState(false)
  const [photoPreviewUri, setPhotoPreviewUri] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [mvpWins, setMvpWins] = useState(0)
  const [sharingProfile, setSharingProfile] = useState(false)
  const shareCardRef = useRef<View>(null)

  const ui = useMemo(
    () => ({
      statCellBg: theme.inputBg,
      yellowCardBg:
        theme.isDark ? 'rgba(234, 179, 8, 0.14)' : '#FEFCE8',
      yellowCardBorder:
        theme.isDark ? 'rgba(234, 179, 8, 0.45)' : '#EAB308',
      redCardBg:
        theme.isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
      redCardBorder:
        theme.isDark ? 'rgba(239, 68, 68, 0.5)' : '#FECACA',
      orgCardBg: theme.logoBoxBg,
      orgCardBorder: theme.logoBoxBorder,
      progressTrack: theme.isDark ? 'rgba(255,255,255,0.12)' : theme.border,
      primaryAccent: theme.primaryAccent,
      accentOnSurface: theme.accentOnSurface,
      dangerOnSurface: theme.dangerOnSurface,
    }),
    [theme]
  )

  const profileStats = useMemo(() => {
    const uid = currentUser?.id
    if (!uid) {
      return {
        playerWins: 0,
        playerDraws: 0,
        playerLosses: 0,
        mvpWins: 0,
        equipos: 0,
        organizedCompleted: 0,
        organizerWins: 0,
        yellow: 0,
        red: 0,
        orgTier: organizerProgress(0),
      }
    }
    const organizedCompleted = matchOpportunities.filter(
      (m) => m.status === 'completed' && m.creatorId === uid
    ).length
    return {
      playerWins: currentUser.statsPlayerWins ?? 0,
      playerDraws: currentUser.statsPlayerDraws ?? 0,
      playerLosses: currentUser.statsPlayerLosses ?? 0,
      mvpWins,
      equipos: getUserTeams().length,
      organizedCompleted,
      organizerWins: currentUser.statsOrganizerWins ?? 0,
      yellow: currentUser.modYellowCards ?? 0,
      red: currentUser.modRedCards ?? 0,
      orgTier: organizerProgress(organizedCompleted),
    }
  }, [currentUser, matchOpportunities, getUserTeams, mvpWins])

  useEffect(() => {
    if (!currentUser?.id || !isSupabaseConfigured()) {
      setMvpWins(0)
      return
    }
    void fetchPlayerMvpWinsCount(getSupabase(), currentUser.id).then(setMvpWins)
  }, [currentUser?.id])

  const shareCardData = useMemo((): ProfileShareCardData | null => {
    if (!currentUser) return null
    const supabase = isSupabaseConfigured() ? getSupabase() : null
    const teams = getUserTeams().map((t) => {
      const fromDb = t.logo?.trim() || null
      const resolved =
        supabase && (!fromDb || isPlaceholderAvatarUrl(fromDb))
          ? resolveTeamLogoDisplayUrl(supabase, t.id, fromDb)
          : fromDb
      return {
        id: t.id,
        name: t.name,
        logoUri: resolved?.trim() || null,
        roleLine: buildShareTeamRoleLine(
          t,
          currentUser.id,
          currentUser.position
        ),
      }
    })
    return {
      name: currentUser.name,
      photoUri: currentUser.photo || DEFAULT_AVATAR,
      position: currentUser.position,
      city: currentUser.city,
      playerWins: profileStats.playerWins,
      playerDraws: profileStats.playerDraws,
      playerLosses: profileStats.playerLosses,
      mvpWins: profileStats.mvpWins,
      yellowCards: profileStats.yellow,
      redCards: profileStats.red,
      teams,
    }
  }, [currentUser, profileStats, getUserTeams])

  const handleShareProfile = useCallback(async () => {
    if (!shareCardData || sharingProfile) return
    setSharingProfile(true)
    try {
      const prefetchUris = [
        shareCardData.photoUri,
        ...shareCardData.teams.map((t) => t.logoUri),
      ].filter((u): u is string => Boolean(u?.trim()))
      const res = await captureAndShareProfileCard(shareCardRef, { prefetchUris })
      if (!res.ok) {
        Alert.alert('No se pudo compartir', res.error)
      }
    } finally {
      setSharingProfile(false)
    }
  }, [shareCardData, sharingProfile])

  const sortedAvailability = useMemo(() => {
    const raw = currentUser?.availability ?? []
    return [...raw].sort(
      (a, b) =>
        DAY_ORDER.indexOf(a.toLowerCase() as (typeof DAY_ORDER)[number]) -
        DAY_ORDER.indexOf(b.toLowerCase() as (typeof DAY_ORDER)[number])
    )
  }, [currentUser?.availability])

  const uploadProfilePhotoFromAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      if (!currentUser || !isSupabaseConfigured()) {
        Alert.alert('Configura Supabase para subir fotos.')
        return
      }
      setPhotoPreviewUri(asset.uri)
      setPhotoWorking(true)
      try {
        const r = await updateProfilePhoto(
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
          asset.fileSize ?? null
        )
        if (!r.ok && r.error) {
          setPhotoPreviewUri(null)
          Alert.alert('No se pudo actualizar la foto', r.error)
        } else {
          setPhotoPreviewUri(null)
        }
      } finally {
        setPhotoWorking(false)
      }
    },
    [currentUser, updateProfilePhoto]
  )

  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) return
    void (async () => {
      const asset = await takeAndroidPendingImageAsset()
      if (!asset) return
      await uploadProfilePhotoFromAsset(asset)
    })()
  }, [currentUser?.id, uploadProfilePhotoFromAsset])

  const pickProfilePhoto = async () => {
    if (!currentUser || !isSupabaseConfigured()) {
      Alert.alert('Configura Supabase para subir fotos.')
      return
    }
    const pending = await takeAndroidPendingImageAsset()
    if (pending) {
      await uploadProfilePhotoFromAsset(pending)
      return
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Necesitamos acceso a la galería para la foto de perfil.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    await uploadProfilePhotoFromAsset(result.assets[0])
  }

  const onDeleteAccountPress = useCallback(() => {
    if (deleteBusy) return
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
              '¿Estás seguro? Perderás acceso a equipos, partidos y mensajes vinculados a esta cuenta.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar mi cuenta',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      setDeleteBusy(true)
                      try {
                        const res = await deleteAccount()
                        setSettingsOpen(false)
                        if (!res.ok) {
                          Alert.alert(
                            'No se pudo eliminar la cuenta',
                            res.error ?? 'Inténtalo más tarde.'
                          )
                        }
                      } finally {
                        setDeleteBusy(false)
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
  }, [deleteAccount, deleteBusy])

  if (!currentUser) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.muted, { color: theme.textMuted }]}>
          Inicia sesión para ver tu perfil.
        </Text>
      </View>
    )
  }

  if (currentUser.accountType !== 'player') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: theme.text }]}>Cuenta</Text>
          <Text style={[styles.meta, { color: theme.textMuted }]}>{currentUser.email}</Text>
          <Pressable style={styles.outBtn} onPress={() => void logout()}>
            <Text style={styles.outBtnText}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  const firstName = currentUser.name.split(/\s+/)[0]?.trim() || 'Jugador'
  const avatarUri = photoPreviewUri ?? currentUser.photo ?? DEFAULT_AVATAR

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.hero,
            {
              backgroundColor: theme.card,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={[styles.heroKicker, { color: theme.textMuted }]}>
                Perfil
              </Text>
              <Text style={[styles.heroTitle, { color: theme.text }]}>
                Hola, {firstName}
              </Text>
            </View>
            <Pressable
              style={[
                styles.iconRound,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.card,
                },
              ]}
              onPress={() => setSettingsOpen(true)}
              accessibilityLabel="Configuración"
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={theme.text}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.cardWrap}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.avatarBlock}>
              <View style={styles.avatarRow}>
                <Pressable
                  onPress={() => void pickProfilePhoto()}
                  disabled={photoWorking}
                  style={[styles.avatarOuter, { borderColor: theme.card }]}
                >
                  {photoWorking ? (
                    <View style={styles.avatarLoading}>
                      <ActivityIndicator size="large" color={theme.primary} />
                    </View>
                  ) : null}
                  <Image key={avatarUri} source={{ uri: avatarUri }} style={styles.avatarImg} />
                </Pressable>
                <Pressable
                  style={[styles.camFab, { backgroundColor: theme.primary, borderColor: theme.card }]}
                  onPress={() => void pickProfilePhoto()}
                  disabled={photoWorking}
                >
                  <Ionicons name="camera" size={18} color={theme.primaryBtnText} />
                </Pressable>
              </View>
              <Pressable
                style={styles.changePhotoBtn}
                onPress={() => void pickProfilePhoto()}
                disabled={photoWorking}
              >
                <Text style={[styles.changePhoto, { color: theme.textMuted }]}>
                  Cambiar foto
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.name, { color: theme.text }]}>
              {currentUser.name}
            </Text>
            <Text style={[styles.cityRow, { color: theme.textMuted }]}>
              📍 {currentUser.city?.trim() || 'Rancagua'}
            </Text>
            {currentUser.whatsappPhone?.trim() ? (
              <Text style={[styles.phoneRow, { color: theme.textMuted }]}>
                📱 {currentUser.whatsappPhone}
              </Text>
            ) : null}

            <View style={styles.badges}>
              <View
                style={[
                  styles.badge,
                  levelBadgeStyle(currentUser.level, theme),
                ]}
              >
                <Text style={[styles.badgeTextDark, { color: theme.text }]}>
                  ⭐ {levelLabel(currentUser.level)}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  posAgeBadgeStyle(theme),
                ]}
              >
                <Text style={[styles.badgeTextDark, { color: theme.text }]}>
                  {positionLabel(currentUser.position) || 'Mediocampista'}
                </Text>
              </View>
              {currentUser.age > 0 ? (
                <View
                  style={[
                    styles.badge,
                    posAgeBadgeStyle(theme),
                  ]}
                >
                  <Text style={[styles.badgeTextDark, { color: theme.text }]}>
                    {currentUser.age} años
                  </Text>
                </View>
              ) : null}
            </View>

            {sortedAvailability.length > 0 ? (
              <View style={styles.avail}>
                <Text style={[styles.availTitle, { color: theme.textMuted }]}>
                  📅 Disponibilidad
                </Text>
                <View style={styles.availRow}>
                  {sortedAvailability.map((d) => (
                    <View
                      key={d}
                      style={[
                        styles.availChip,
                        {
                          backgroundColor: theme.logoBoxBg,
                          borderColor: theme.logoBoxBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.availChipText,
                          { color: theme.isDark ? ui.primaryAccent : theme.primary },
                        ]}
                      >
                        {formatDayLabel(d)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View
              style={[
                styles.statsSectionWrap,
                { borderTopColor: theme.border },
              ]}
            >
              <View style={styles.perfGrid}>
                {(
                  [
                    {
                      icon: 'trophy' as const,
                      value: profileStats.playerWins,
                      label: 'Victorias',
                      hint: 'Como jugador (V)',
                    },
                    {
                      icon: 'remove-outline' as const,
                      value: profileStats.playerDraws,
                      label: 'Empates',
                      hint: 'Como jugador (E)',
                    },
                    {
                      icon: 'trending-down-outline' as const,
                      value: profileStats.playerLosses,
                      label: 'Derrotas',
                      hint: 'Como jugador (D)',
                    },
                    {
                      icon: 'ribbon' as const,
                      value: profileStats.mvpWins,
                      label: 'MVP',
                      hint: 'Partidos como MVP (empates incluidos)',
                    },
                    {
                      icon: 'people' as const,
                      value: profileStats.equipos,
                      label: 'Equipos',
                      hint: 'Tus equipos',
                    },
                  ] as const
                ).map((cell) => {
                  const iconColor =
                    cell.icon === 'trophy' ||
                    cell.icon === 'people' ||
                    cell.icon === 'ribbon'
                      ? ui.primaryAccent
                      : cell.icon === 'remove-outline'
                        ? ui.accentOnSurface
                        : ui.dangerOnSurface
                  return (
                  <View
                    key={cell.label}
                    style={[
                      styles.perfCell,
                      {
                        backgroundColor: ui.statCellBg,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={cell.icon}
                      size={20}
                      color={iconColor}
                    />
                    <Text style={[styles.statNum, { color: theme.text }]}>
                      {cell.value}
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: theme.text }]}
                    >
                      {cell.label}
                    </Text>
                    <Text style={[styles.statHint, { color: theme.textMuted }]}>
                      {cell.hint}
                    </Text>
                  </View>
                  )
                })}
              </View>

              <Pressable
                style={[
                  styles.shareBtn,
                  {
                    backgroundColor: theme.isDark
                      ? 'rgba(34, 197, 94, 0.12)'
                      : 'rgba(15, 69, 57, 0.08)',
                    borderColor: theme.isDark
                      ? 'rgba(74, 222, 128, 0.35)'
                      : 'rgba(15, 69, 57, 0.25)',
                  },
                  sharingProfile && styles.shareBtnDisabled,
                ]}
                disabled={sharingProfile || !shareCardData}
                onPress={() => void handleShareProfile()}
              >
                {sharingProfile ? (
                  <ActivityIndicator color={theme.primary} />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={22} color={theme.primary} />
                    <Text style={[styles.shareBtnText, { color: theme.primary }]}>
                      Compartir perfil
                    </Text>
                  </>
                )}
              </Pressable>

              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons
                    name="shield-checkmark"
                    size={18}
                    color={ui.primaryAccent}
                  />
                  <Text
                    style={[styles.sectionTitle, { color: theme.text }]}
                  >
                    Historial de amonestaciones por reportes
                  </Text>
                </View>
                <View style={styles.modRow}>
                  <View
                    style={[
                      styles.modCard,
                      {
                        backgroundColor: ui.yellowCardBg,
                        borderColor: ui.yellowCardBorder,
                      },
                    ]}
                  >
                    <Ionicons name="warning" size={22} color={theme.accent} />
                    <Text
                      style={[styles.modCardNum, { color: theme.text }]}
                    >
                      {profileStats.yellow}
                    </Text>
                    <Text
                      style={[styles.modCardTitle, { color: theme.text }]}
                    >
                      Amarillas
                    </Text>
                    <Text style={[styles.modCardHint, { color: theme.textMuted }]}>
                      Acumuladas en cuenta
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.modCard,
                      {
                        backgroundColor: ui.redCardBg,
                        borderColor: ui.redCardBorder,
                      },
                    ]}
                  >
                    <Ionicons
                      name="alert-circle"
                      size={22}
                      color={theme.danger}
                    />
                    <Text
                      style={[styles.modCardNum, { color: theme.text }]}
                    >
                      {profileStats.red}
                    </Text>
                    <Text
                      style={[styles.modCardTitle, { color: theme.text }]}
                    >
                      Rojas
                    </Text>
                    <Text style={[styles.modCardHint, { color: theme.textMuted }]}>
                      Acumuladas en cuenta
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons
                    name="shield-checkmark"
                    size={18}
                    color={ui.primaryAccent}
                  />
                  <Text
                    style={[styles.sectionTitle, { color: theme.text }]}
                  >
                    Organización de partidos
                  </Text>
                </View>
                <View
                  style={[
                    styles.orgCard,
                    {
                      backgroundColor: ui.orgCardBg,
                      borderColor: ui.orgCardBorder,
                    },
                  ]}
                >
                  <View style={styles.orgTopRow}>
                    <View style={styles.orgLeft}>
                      <Text
                        style={[styles.orgBigNum, { color: theme.text }]}
                      >
                        {profileStats.organizedCompleted}
                      </Text>
                      <Text style={[styles.orgSub, { color: theme.textMuted }]}>
                        Partidos organizados finalizados
                      </Text>
                    </View>
                    <Text
                      style={[styles.orgTierLabel, { color: theme.primary }]}
                    >
                      {profileStats.orgTier.label}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.progressTrack,
                      { backgroundColor: ui.progressTrack },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round(profileStats.orgTier.progress * 100)}%`,
                          backgroundColor: theme.primary,
                        },
                      ]}
                    />
                  </View>
                  {profileStats.orgTier.nextLabel ? (
                    <Text style={[styles.orgNext, { color: theme.textMuted }]}>
                      Siguiente: {profileStats.orgTier.nextLabel}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.orgFooter, { color: theme.text }]}
                  >
                    Victorias de tu equipo al organizar:{' '}
                    {profileStats.organizerWins}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.menu}>
          <Pressable
            style={[
              styles.menuRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => {
              openProfileEditor()
              router.push('/')
            }}
          >
            <View
              style={[
                styles.menuIcon,
                {
                  backgroundColor:
                    theme.inputBg,
                },
              ]}
            >
              <Ionicons
                name="create-outline"
                size={22}
                color={theme.textMuted}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>
                Editar perfil
              </Text>
              <Text style={[styles.menuSub, { color: theme.textMuted }]}>
                Nombre, posición, nivel, foto…
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </Pressable>

          <Pressable
            style={[
              styles.menuRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => setFeedbackOpen(true)}
          >
            <View
              style={[
                styles.menuIcon,
                {
                  backgroundColor:
                    theme.inputBg,
                },
              ]}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={22}
                color={theme.textMuted}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>
                Sugerencias, opiniones, errores
              </Text>
              <Text style={[styles.menuSub, { color: theme.textMuted }]}>
                Envía comentarios al equipo SportMatch
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </Pressable>

          <Pressable
            style={[
              styles.menuRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => router.push('/partidos?tab=mine')}
          >
            <View
              style={[
                styles.menuIcon,
                {
                  backgroundColor:
                    theme.inputBg,
                },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={22}
                color={theme.textMuted}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>
                Historial de partidos
              </Text>
              <Text style={[styles.menuSub, { color: theme.textMuted }]}>
                Próximos y jugados
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </Pressable>

          <Pressable
            style={[
              styles.menuRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => setSettingsOpen(true)}
          >
            <View
              style={[
                styles.menuIcon,
                {
                  backgroundColor:
                    theme.inputBg,
                },
              ]}
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={theme.textMuted}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>
                Configuración
              </Text>
              <Text style={[styles.menuSub, { color: theme.textMuted }]}>
                Ajustes y app
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.logoutWide,
            {
              backgroundColor: theme.card,
              borderColor: 'rgba(220, 38, 38, 0.4)',
            },
          ]}
          onPress={() => void logout()}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.danger} />
          <Text style={[styles.logoutWideText, { color: theme.danger }]}>
            Cerrar sesión
          </Text>
        </Pressable>

        <Text style={[styles.version, { color: theme.textMuted }]}>
          SportMatch v1.0.0
        </Text>
      </ScrollView>

      {shareCardData ? (
        <View style={styles.shareCardHost} pointerEvents="none">
          <ProfileShareCard ref={shareCardRef} data={shareCardData} />
        </View>
      ) : null}

      <AppFeedbackModal
        visible={feedbackOpen}
        userId={currentUser?.id}
        theme={theme}
        onClose={() => setFeedbackOpen(false)}
      />

      <Modal
        visible={settingsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.modalRoot}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSettingsOpen(false)}
        />
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: theme.card },
          ]}
        >
          <View
            style={[
              styles.modalHandle,
              { backgroundColor: theme.border },
            ]}
          />
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Configuración
          </Text>
          <Text style={[styles.modalDesc, { color: theme.textMuted }]}>
            Ajustes de la cuenta y la aplicación.
          </Text>
          <ScrollView style={styles.modalScroll}>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    theme.inputBg,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: theme.text }]}>
                Apariencia
              </Text>
              <SettingsAppearancePanel theme={theme} />
            </View>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    theme.inputBg,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: theme.text }]}>
                Notificaciones
              </Text>
              <SettingsNotificationsPanel
                theme={theme}
                active={settingsOpen}
                onOpenHistory={() => setSettingsOpen(false)}
              />
            </View>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    theme.inputBg,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: theme.text }]}>
                Cuenta
              </Text>
              <Text style={[styles.settingBody, { color: theme.textMuted }]}>
                Puedes eliminar tu cuenta y los datos asociados de forma permanente.
              </Text>
              <Pressable
                style={[
                  styles.deleteAccountBtn,
                  deleteBusy && styles.deleteAccountBtnDisabled,
                ]}
                onPress={onDeleteAccountPress}
                disabled={deleteBusy}
              >
                {deleteBusy ? (
                  <ActivityIndicator color={theme.danger} size="small" />
                ) : (
                  <Text style={[styles.deleteAccountText, { color: theme.danger }]}>
                    Eliminar mi cuenta
                  </Text>
                )}
              </Pressable>
            </View>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    theme.inputBg,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: theme.text }]}>
                Privacidad
              </Text>
              <Text style={[styles.settingBody, { color: theme.textMuted }]}>
                Tus datos se usan solo para conectar partidos dentro de la app.
              </Text>
              <View style={styles.legalLinksRow}>
                <Link href="/privacy-policy" asChild>
                  <Pressable>
                    <Text style={[styles.legalLinkText, { color: theme.primary }]}>
                      Política de Privacidad
                    </Text>
                  </Pressable>
                </Link>
                <Text style={[styles.legalSep, { color: theme.textMuted }]}>·</Text>
                <Link href="/terms" asChild>
                  <Pressable>
                    <Text style={[styles.legalLinkText, { color: theme.primary }]}>
                      Términos de Uso
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </View>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    theme.inputBg,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: theme.text }]}>
                Acerca de
              </Text>
              <SettingsAboutPanel theme={theme} />
            </View>
          </ScrollView>
          <Pressable
            style={styles.modalLogout}
            onPress={() => {
              setSettingsOpen(false)
              void logout()
            }}
          >
            <Text style={[styles.modalLogoutText, { color: theme.danger }]}>
              Cerrar sesión
            </Text>
          </Pressable>
          <Pressable
            style={styles.modalClose}
            onPress={() => setSettingsOpen(false)}
          >
            <Text style={[styles.modalCloseText, { color: theme.primary }]}>
              Cerrar
            </Text>
          </Pressable>
        </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontSize: 15, color: theme.textMuted },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 8 },
  meta: { fontSize: 14, color: theme.textMuted, marginBottom: 20 },
  outBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: theme.chipBg,
    borderRadius: 10,
  },
  outBtnText: { fontSize: 16, fontWeight: '600', color: theme.text },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    backgroundColor: theme.card,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: theme.text, marginTop: 4 },
  iconRound: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.card,
  },
  cardWrap: { paddingHorizontal: 16, marginTop: -12 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    paddingTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarBlock: { alignItems: 'center', marginTop: -40 },
  avatarRow: {
    width: 112,
    alignSelf: 'center',
    position: 'relative',
  },
  avatarOuter: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 4,
    borderColor: theme.card,
    overflow: 'hidden',
    backgroundColor: theme.skeleton,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.overlay,
    zIndex: 2,
  },
  camFab: {
    position: 'absolute',
    bottom: 2,
    right: -4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.card,
  },
  changePhotoBtn: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  changePhoto: {
    fontSize: 12,
    textAlign: 'center',
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
    marginTop: 8,
  },
  cityRow: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  phoneRow: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  badgePrimary: {
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    borderColor: 'rgba(37, 99, 235, 0.35)',
  },
  badgeTeal: {
    backgroundColor: 'rgba(8, 145, 178, 0.12)',
    borderColor: 'rgba(8, 145, 178, 0.35)',
  },
  badgeRed: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderColor: 'rgba(220, 38, 38, 0.35)',
  },
  badgeNeutral: {
    backgroundColor: theme.chipBg,
    borderColor: theme.border,
  },
  badgePos: {
    backgroundColor: theme.chipBg,
    borderColor: theme.border,
  },
  badgeTextDark: { fontSize: 12, fontWeight: '600', color: theme.text },
  avail: { marginTop: 18, width: '100%' },
  availTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  availRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  availChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  availChipText: { fontSize: 11, fontWeight: '600', color: theme.primary },
  statsSectionWrap: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  perfGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  perfCell: {
    width: '47.5%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  statNum: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  statLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  statHint: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  shareBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  shareBtnDisabled: { opacity: 0.6 },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  shareCardHost: {
    position: 'absolute',
    left: -5000,
    top: 0,
    width: 360,
    height: 640,
  },
  sectionBlock: { marginTop: 20, width: '100%' },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  modRow: { flexDirection: 'row', gap: 8 },
  modCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  modCardNum: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  modCardTitle: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  modCardHint: { fontSize: 10, marginTop: 4, textAlign: 'center' },
  orgCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
  },
  orgTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orgLeft: { flex: 1, marginRight: 8 },
  orgBigNum: { fontSize: 28, fontWeight: '800' },
  orgSub: { fontSize: 11, marginTop: 4 },
  orgTierLabel: { fontSize: 12, fontWeight: '700', textAlign: 'right', maxWidth: 160 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  orgNext: { fontSize: 12, marginTop: 8 },
  orgFooter: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  menu: { paddingHorizontal: 16, marginTop: 16, gap: 10 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1, minWidth: 0 },
  menuTitle: { fontSize: 16, fontWeight: '700' },
  menuSub: { fontSize: 12, marginTop: 2 },
  logoutWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutWideText: { fontSize: 16, fontWeight: '700' },
  version: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 12,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalDesc: { fontSize: 14, marginTop: 6, marginBottom: 12 },
  modalScroll: { maxHeight: 480 },
  settingBlock: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  settingHead: { fontSize: 15, fontWeight: '700' },
  settingBody: { fontSize: 13, marginTop: 6, lineHeight: 20 },
  modalLogout: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.4)',
  },
  modalLogoutText: { fontSize: 16, fontWeight: '700' },
  deleteAccountBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.45)',
    alignItems: 'center',
  },
  deleteAccountBtnDisabled: { opacity: 0.6 },
  deleteAccountText: { fontSize: 15, fontWeight: '700' },
  legalLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  legalLinkText: { fontSize: 14, fontWeight: '600' },
  legalSep: { fontSize: 14 },
  modalClose: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 16, fontWeight: '600' },
})
}
