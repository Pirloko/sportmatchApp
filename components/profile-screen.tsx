import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useThemePreference } from '../lib/theme-context'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { DEFAULT_AVATAR } from '../lib/supabase/mappers'
import type { Level } from '../lib/types'

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

function levelBadgeStyle(
  level: Level | undefined,
  resolved: 'light' | 'dark'
): object {
  const dark = resolved === 'dark'
  switch (level) {
    case 'principiante':
      return dark
        ? {
            backgroundColor: 'rgba(59, 130, 246, 0.22)',
            borderColor: 'rgba(96, 165, 250, 0.5)',
          }
        : styles.badgeBlue
    case 'intermedio':
      return dark
        ? {
            backgroundColor: 'rgba(37, 99, 235, 0.22)',
            borderColor: 'rgba(96, 165, 250, 0.5)',
          }
        : styles.badgePrimary
    case 'avanzado':
      return dark
        ? {
            backgroundColor: 'rgba(8, 145, 178, 0.22)',
            borderColor: 'rgba(34, 211, 238, 0.45)',
          }
        : styles.badgeTeal
    case 'competitivo':
      return dark
        ? {
            backgroundColor: 'rgba(220, 38, 38, 0.2)',
            borderColor: 'rgba(248, 113, 113, 0.5)',
          }
        : styles.badgeRed
    default:
      return dark
        ? {
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderColor: 'rgba(148, 163, 184, 0.35)',
          }
        : styles.badgeNeutral
  }
}

function posAgeBadgeStyle(
  resolved: 'light' | 'dark',
  borderColor: string
): object {
  return resolved === 'dark'
    ? {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor,
      }
    : styles.badgePos
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
    openProfileEditor,
    matchOpportunities,
    getUserTeams,
    updateProfilePhoto,
  } = useApp()
  const { tokens, resolved } = useThemePreference()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [photoWorking, setPhotoWorking] = useState(false)

  const ui = useMemo(
    () => ({
      statCellBg:
        resolved === 'dark' ? 'rgba(255,255,255,0.06)' : '#f9fafb',
      yellowCardBg:
        resolved === 'dark' ? 'rgba(234, 179, 8, 0.14)' : '#FEFCE8',
      yellowCardBorder:
        resolved === 'dark' ? 'rgba(234, 179, 8, 0.45)' : '#EAB308',
      redCardBg:
        resolved === 'dark' ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
      redCardBorder:
        resolved === 'dark' ? 'rgba(239, 68, 68, 0.5)' : '#FECACA',
      orgCardBg:
        resolved === 'dark'
          ? 'rgba(55, 214, 122, 0.12)'
          : 'rgba(47, 158, 68, 0.1)',
      orgCardBorder:
        resolved === 'dark'
          ? 'rgba(55, 214, 122, 0.35)'
          : 'rgba(47, 158, 68, 0.35)',
      progressTrack:
        resolved === 'dark' ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
    }),
    [resolved]
  )

  const profileStats = useMemo(() => {
    const uid = currentUser?.id
    if (!uid) {
      return {
        playerWins: 0,
        playerDraws: 0,
        playerLosses: 0,
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
      equipos: getUserTeams().length,
      organizedCompleted,
      organizerWins: currentUser.statsOrganizerWins ?? 0,
      yellow: currentUser.modYellowCards ?? 0,
      red: currentUser.modRedCards ?? 0,
      orgTier: organizerProgress(organizedCompleted),
    }
  }, [currentUser, matchOpportunities, getUserTeams])

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
      setPhotoWorking(true)
      try {
        const r = await updateProfilePhoto(
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
          asset.fileSize ?? null
        )
        if (!r.ok && r.error) Alert.alert('No se pudo actualizar la foto', r.error)
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

  if (!currentUser) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bgDark }]}>
        <Text style={[styles.muted, { color: tokens.textMuted }]}>
          Inicia sesión para ver tu perfil.
        </Text>
      </View>
    )
  }

  if (currentUser.accountType !== 'player') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: tokens.textPrimary }]}>Cuenta</Text>
          <Text style={[styles.meta, { color: tokens.textMuted }]}>{currentUser.email}</Text>
          <Pressable style={styles.outBtn} onPress={() => void logout()}>
            <Text style={styles.outBtnText}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  const firstName = currentUser.name.split(/\s+/)[0]?.trim() || 'Jugador'
  const avatarUri = currentUser.photo || DEFAULT_AVATAR

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.hero,
            {
              backgroundColor: tokens.cardDark,
              borderBottomColor: tokens.borderDark,
            },
          ]}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={[styles.heroKicker, { color: tokens.textMuted }]}>
                Perfil
              </Text>
              <Text style={[styles.heroTitle, { color: tokens.textPrimary }]}>
                Hola, {firstName}
              </Text>
            </View>
            <Pressable
              style={[
                styles.iconRound,
                {
                  borderColor: tokens.borderDark,
                  backgroundColor: tokens.cardDark,
                },
              ]}
              onPress={() => setSettingsOpen(true)}
              accessibilityLabel="Configuración"
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={tokens.textPrimary}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.cardWrap}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: tokens.cardDark,
                borderColor: tokens.borderDark,
              },
            ]}
          >
            <View style={styles.avatarBlock}>
              <View style={styles.avatarRow}>
                <Pressable
                  onPress={() => void pickProfilePhoto()}
                  disabled={photoWorking}
                  style={[styles.avatarOuter, { borderColor: tokens.cardDark }]}
                >
                  {photoWorking ? (
                    <View style={styles.avatarLoading}>
                      <ActivityIndicator size="large" color={tokens.primaryGreen} />
                    </View>
                  ) : null}
                  <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                </Pressable>
                <Pressable
                  style={[styles.camFab, { backgroundColor: tokens.primaryGreen, borderColor: tokens.cardDark }]}
                  onPress={() => void pickProfilePhoto()}
                  disabled={photoWorking}
                >
                  <Ionicons name="camera" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
            <Pressable onPress={() => void pickProfilePhoto()} disabled={photoWorking}>
              <Text style={[styles.changePhoto, { color: tokens.textMuted }]}>
                Cambiar foto
              </Text>
            </Pressable>

            <Text style={[styles.name, { color: tokens.textPrimary }]}>
              {currentUser.name}
            </Text>
            <Text style={[styles.cityRow, { color: tokens.textMuted }]}>
              📍 {currentUser.city?.trim() || 'Rancagua'}
            </Text>
            {currentUser.whatsappPhone?.trim() ? (
              <Text style={[styles.phoneRow, { color: tokens.textMuted }]}>
                📱 {currentUser.whatsappPhone}
              </Text>
            ) : null}

            <View style={styles.badges}>
              <View
                style={[
                  styles.badge,
                  levelBadgeStyle(currentUser.level, resolved),
                ]}
              >
                <Text style={[styles.badgeTextDark, { color: tokens.textPrimary }]}>
                  ⭐ {levelLabel(currentUser.level)}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  posAgeBadgeStyle(resolved, tokens.borderDark),
                ]}
              >
                <Text style={[styles.badgeTextDark, { color: tokens.textPrimary }]}>
                  {positionLabel(currentUser.position) || 'Mediocampista'}
                </Text>
              </View>
              {currentUser.age > 0 ? (
                <View
                  style={[
                    styles.badge,
                    posAgeBadgeStyle(resolved, tokens.borderDark),
                  ]}
                >
                  <Text style={[styles.badgeTextDark, { color: tokens.textPrimary }]}>
                    {currentUser.age} años
                  </Text>
                </View>
              ) : null}
            </View>

            {sortedAvailability.length > 0 ? (
              <View style={styles.avail}>
                <Text style={[styles.availTitle, { color: tokens.textMuted }]}>
                  📅 Disponibilidad
                </Text>
                <View style={styles.availRow}>
                  {sortedAvailability.map((d) => (
                    <View
                      key={d}
                      style={[
                        styles.availChip,
                        {
                          backgroundColor:
                            resolved === 'dark'
                              ? 'rgba(55, 214, 122, 0.15)'
                              : 'rgba(47, 158, 68, 0.12)',
                          borderColor:
                            resolved === 'dark'
                              ? 'rgba(55, 214, 122, 0.35)'
                              : 'rgba(47, 158, 68, 0.3)',
                        },
                      ]}
                    >
                      <Text
                        style={[styles.availChipText, { color: tokens.primaryGreen }]}
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
                { borderTopColor: tokens.borderDark },
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
                      icon: 'people' as const,
                      value: profileStats.equipos,
                      label: 'Equipos',
                      hint: 'Tus equipos',
                    },
                  ] as const
                ).map((cell) => (
                  <View
                    key={cell.label}
                    style={[
                      styles.perfCell,
                      {
                        backgroundColor: ui.statCellBg,
                        borderColor: tokens.borderDark,
                      },
                    ]}
                  >
                    <Ionicons
                      name={cell.icon}
                      size={20}
                      color={tokens.primaryGreen}
                    />
                    <Text style={[styles.statNum, { color: tokens.textPrimary }]}>
                      {cell.value}
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: tokens.textPrimary }]}
                    >
                      {cell.label}
                    </Text>
                    <Text style={[styles.statHint, { color: tokens.textMuted }]}>
                      {cell.hint}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons
                    name="shield-checkmark"
                    size={18}
                    color={tokens.primaryGreen}
                  />
                  <Text
                    style={[styles.sectionTitle, { color: tokens.textPrimary }]}
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
                    <Ionicons name="warning" size={22} color="#CA8A04" />
                    <Text
                      style={[styles.modCardNum, { color: tokens.textPrimary }]}
                    >
                      {profileStats.yellow}
                    </Text>
                    <Text
                      style={[styles.modCardTitle, { color: tokens.textPrimary }]}
                    >
                      Amarillas
                    </Text>
                    <Text style={[styles.modCardHint, { color: tokens.textMuted }]}>
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
                      color={tokens.danger}
                    />
                    <Text
                      style={[styles.modCardNum, { color: tokens.textPrimary }]}
                    >
                      {profileStats.red}
                    </Text>
                    <Text
                      style={[styles.modCardTitle, { color: tokens.textPrimary }]}
                    >
                      Rojas
                    </Text>
                    <Text style={[styles.modCardHint, { color: tokens.textMuted }]}>
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
                    color={tokens.primaryGreen}
                  />
                  <Text
                    style={[styles.sectionTitle, { color: tokens.textPrimary }]}
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
                        style={[styles.orgBigNum, { color: tokens.textPrimary }]}
                      >
                        {profileStats.organizedCompleted}
                      </Text>
                      <Text style={[styles.orgSub, { color: tokens.textMuted }]}>
                        Partidos organizados finalizados
                      </Text>
                    </View>
                    <Text
                      style={[styles.orgTierLabel, { color: tokens.primaryGreen }]}
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
                          backgroundColor: tokens.primaryGreen,
                        },
                      ]}
                    />
                  </View>
                  {profileStats.orgTier.nextLabel ? (
                    <Text style={[styles.orgNext, { color: tokens.textMuted }]}>
                      Siguiente: {profileStats.orgTier.nextLabel}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.orgFooter, { color: tokens.textPrimary }]}
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
              { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark },
            ]}
            onPress={openProfileEditor}
          >
            <View
              style={[
                styles.menuIcon,
                {
                  backgroundColor:
                    resolved === 'dark' ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                },
              ]}
            >
              <Ionicons
                name="create-outline"
                size={22}
                color={tokens.textMuted}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuTitle, { color: tokens.textPrimary }]}>
                Editar perfil
              </Text>
              <Text style={[styles.menuSub, { color: tokens.textMuted }]}>
                Nombre, posición, nivel, foto…
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={tokens.textMuted} />
          </Pressable>

          <Pressable
            style={[
              styles.menuRow,
              { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark },
            ]}
            onPress={() => router.push('/equipos')}
          >
            <View
              style={[
                styles.menuIcon,
                {
                  backgroundColor:
                    resolved === 'dark' ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={22}
                color={tokens.textMuted}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuTitle, { color: tokens.textPrimary }]}>
                Mis equipos
              </Text>
              <Text style={[styles.menuSub, { color: tokens.textMuted }]}>
                Crear o gestionar equipos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={tokens.textMuted} />
          </Pressable>

          <Pressable
            style={[
              styles.menuRow,
              { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark },
            ]}
            onPress={() => router.push('/partidos?tab=mine')}
          >
            <View
              style={[
                styles.menuIcon,
                {
                  backgroundColor:
                    resolved === 'dark' ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={22}
                color={tokens.textMuted}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuTitle, { color: tokens.textPrimary }]}>
                Historial de partidos
              </Text>
              <Text style={[styles.menuSub, { color: tokens.textMuted }]}>
                Próximos y jugados
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={tokens.textMuted} />
          </Pressable>

          <Pressable
            style={[
              styles.menuRow,
              { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark },
            ]}
            onPress={() => setSettingsOpen(true)}
          >
            <View
              style={[
                styles.menuIcon,
                {
                  backgroundColor:
                    resolved === 'dark' ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                },
              ]}
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={tokens.textMuted}
              />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuTitle, { color: tokens.textPrimary }]}>
                Configuración
              </Text>
              <Text style={[styles.menuSub, { color: tokens.textMuted }]}>
                Ajustes y app
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={tokens.textMuted} />
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.logoutWide,
            {
              backgroundColor: tokens.cardDark,
              borderColor: 'rgba(220, 38, 38, 0.4)',
            },
          ]}
          onPress={() => void logout()}
        >
          <Ionicons name="log-out-outline" size={20} color={tokens.danger} />
          <Text style={[styles.logoutWideText, { color: tokens.danger }]}>
            Cerrar sesión
          </Text>
        </Pressable>

        <Text style={[styles.version, { color: tokens.textMuted }]}>
          SportMatch v1.0.0
        </Text>
      </ScrollView>

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
            { backgroundColor: tokens.cardDark },
          ]}
        >
          <View
            style={[
              styles.modalHandle,
              { backgroundColor: tokens.borderDark },
            ]}
          />
          <Text style={[styles.modalTitle, { color: tokens.textPrimary }]}>
            Configuración
          </Text>
          <Text style={[styles.modalDesc, { color: tokens.textMuted }]}>
            Ajustes de la cuenta y la aplicación.
          </Text>
          <ScrollView style={styles.modalScroll}>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    resolved === 'dark' ? 'rgba(255,255,255,0.06)' : '#f9fafb',
                  borderColor: tokens.borderDark,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: tokens.textPrimary }]}>
                Apariencia
              </Text>
              <Text style={[styles.settingBody, { color: tokens.textMuted }]}>
                Tema claro / oscuro: próximamente (Bloque 17).
              </Text>
            </View>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    resolved === 'dark' ? 'rgba(255,255,255,0.06)' : '#f9fafb',
                  borderColor: tokens.borderDark,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: tokens.textPrimary }]}>
                Notificaciones
              </Text>
              <Text style={[styles.settingBody, { color: tokens.textMuted }]}>
                Próximamente podrás elegir avisos de partidos y mensajes.
              </Text>
            </View>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    resolved === 'dark' ? 'rgba(255,255,255,0.06)' : '#f9fafb',
                  borderColor: tokens.borderDark,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: tokens.textPrimary }]}>
                Privacidad
              </Text>
              <Text style={[styles.settingBody, { color: tokens.textMuted }]}>
                Tus datos se usan solo para conectar partidos dentro de la app.
              </Text>
            </View>
            <View
              style={[
                styles.settingBlock,
                {
                  backgroundColor:
                    resolved === 'dark' ? 'rgba(255,255,255,0.06)' : '#f9fafb',
                  borderColor: tokens.borderDark,
                },
              ]}
            >
              <Text style={[styles.settingHead, { color: tokens.textPrimary }]}>
                Acerca de
              </Text>
              <Text style={[styles.settingBody, { color: tokens.textMuted }]}>
                SportMatch — encuentra rivales, jugadores y revueltas en tu ciudad.
              </Text>
            </View>
          </ScrollView>
          <Pressable
            style={styles.modalLogout}
            onPress={() => {
              setSettingsOpen(false)
              void logout()
            }}
          >
            <Text style={[styles.modalLogoutText, { color: tokens.danger }]}>
              Cerrar sesión
            </Text>
          </Pressable>
          <Pressable
            style={styles.modalClose}
            onPress={() => setSettingsOpen(false)}
          >
            <Text style={[styles.modalCloseText, { color: tokens.primaryGreen }]}>
              Cerrar
            </Text>
          </Pressable>
        </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontSize: 15, color: '#6b7280' },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 8 },
  meta: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  outBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
  },
  outBtnText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#111', marginTop: 4 },
  iconRound: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cardWrap: { paddingHorizontal: 16, marginTop: -12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
    borderColor: '#fff',
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    zIndex: 2,
  },
  camFab: {
    position: 'absolute',
    bottom: 2,
    right: -4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  changePhoto: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 4,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginTop: 8,
  },
  cityRow: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 6,
  },
  phoneRow: {
    fontSize: 14,
    color: '#6b7280',
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
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  badgePos: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  badgeTextDark: { fontSize: 12, fontWeight: '600', color: '#374151' },
  avail: { marginTop: 18, width: '100%' },
  availTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
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
  availChipText: { fontSize: 11, fontWeight: '600', color: '#1d4ed8' },
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
  modalScroll: { maxHeight: 320 },
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
  modalClose: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 16, fontWeight: '600' },
})
