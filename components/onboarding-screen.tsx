import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { takeAndroidPendingImageAsset } from '../lib/android-image-picker-pending'
import { useApp } from '../lib/app-provider'
import { useThemePreference } from '../lib/theme-context'
import { createClient, isSupabaseConfigured } from '../lib/supabase/client'
import { DEFAULT_AVATAR } from '../lib/supabase/mappers'
import { uploadProfileAvatarFromUri } from '../lib/supabase/profile-photo'
import type { Level, OnboardingData, Position } from '../lib/types'

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'portero', label: 'Portero' },
  { value: 'defensa', label: 'Defensa' },
  { value: 'mediocampista', label: 'Mediocampista' },
  { value: 'delantero', label: 'Delantero' },
]

const LEVELS: { value: Level; label: string; description: string }[] = [
  { value: 'principiante', label: 'Principiante', description: 'Recién empezando' },
  { value: 'intermedio', label: 'Intermedio', description: 'Juego regularmente' },
  { value: 'avanzado', label: 'Avanzado', description: 'Tengo experiencia' },
  { value: 'competitivo', label: 'Competitivo', description: 'Nivel de torneo' },
]

const DAYS = [
  'Lunes',
  'Martes',
  'Miercoles',
  'Jueves',
  'Viernes',
  'Sabado',
  'Domingo',
]

export function OnboardingScreen() {
  const {
    completeOnboarding,
    currentUser,
    onboardingSource,
    exitProfileEditor,
    logout,
  } = useApp()
  const { tokens } = useThemePreference()
  const [photoUploading, setPhotoUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>({
    name: '',
    age: 0,
    gender: currentUser?.gender || 'male',
    whatsappPhone: currentUser?.whatsappPhone || '',
    position: 'mediocampista',
    level: 'intermedio',
    availability: [],
    city: 'Rancagua',
    photo: '',
  })

  const totalSteps = 4
  const isEditMode = onboardingSource === 'profile_edit'

  useEffect(() => {
    if (!isEditMode || !currentUser) return
    setData({
      name: currentUser.name,
      age: currentUser.age,
      gender: currentUser.gender,
      whatsappPhone: currentUser.whatsappPhone || '',
      position: currentUser.position,
      level: currentUser.level,
      availability: [...currentUser.availability],
      city: currentUser.city,
      photo: currentUser.photo || '',
    })
    setStep(1)
  }, [isEditMode, currentUser?.id])

  const uploadAvatarFromAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      if (!currentUser || !isSupabaseConfigured()) {
        Alert.alert('Configura Supabase para subir fotos.')
        return
      }
      setPhotoUploading(true)
      try {
        const supabase = createClient()
        const up = await uploadProfileAvatarFromUri(
          supabase,
          currentUser.id,
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
          asset.fileSize ?? null
        )
        if ('error' in up) {
          Alert.alert(up.error)
          return
        }
        setData((prev) => ({ ...prev, photo: up.publicUrl }))
      } finally {
        setPhotoUploading(false)
      }
    },
    [currentUser]
  )

  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) return
    void (async () => {
      const asset = await takeAndroidPendingImageAsset()
      if (!asset) return
      await uploadAvatarFromAsset(asset)
    })()
  }, [currentUser?.id, uploadAvatarFromAsset])

  const pickPhoto = async () => {
    if (!currentUser || !isSupabaseConfigured()) {
      Alert.alert('Configura Supabase para subir fotos.')
      return
    }
    const pending = await takeAndroidPendingImageAsset()
    if (pending) {
      await uploadAvatarFromAsset(pending)
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
    await uploadAvatarFromAsset(result.assets[0])
  }

  const toggleAvailability = (day: string) => {
    const dayLower = day.toLowerCase()
    if (data.availability.includes(dayLower)) {
      setData({
        ...data,
        availability: data.availability.filter((d) => d !== dayLower),
      })
    } else {
      setData({ ...data, availability: [...data.availability, dayLower] })
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1:
        return (
          data.name.length >= 2 &&
          data.age >= 16 &&
          data.whatsappPhone.trim().length >= 8
        )
      case 2:
        return true
      case 3:
        return data.availability.length > 0
      case 4:
        return true
      default:
        return false
    }
  }

  const handleNext = async () => {
    if (step < totalSteps) {
      setStep(step + 1)
      return
    }
    setSubmitting(true)
    try {
      const res = await completeOnboarding({
        ...data,
        photo: data.photo || DEFAULT_AVATAR,
      })
      if (!res.ok && res.error) {
        Alert.alert('No se pudo guardar', res.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
      return
    }
    if (isEditMode) {
      exitProfileEditor()
      return
    }
    Alert.alert(
      'Salir',
      '¿Cerrar sesión para usar otra cuenta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: () => void logout() },
      ]
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: tokens.bgDark }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.dots}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < step && styles.dotFill,
                i === step - 1 && styles.dotActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: tokens.bgDark }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h1}>
          {step === 1
            ? isEditMode
              ? 'Editar datos'
              : 'Información básica'
            : step === 2
              ? 'Tu posición'
              : step === 3
                ? 'Disponibilidad'
                : 'Foto de perfil'}
        </Text>
        <Text style={styles.sub}>
          {step === 1
            ? 'Nombre, edad, ciudad, WhatsApp y nivel'
            : step === 2
              ? '¿Dónde te ubicas en la cancha?'
              : step === 3
                ? '¿Cuándo puedes jugar?'
                : 'Opcional: elige de la galería o usa la foto de ejemplo.'}
        </Text>

        {step === 1 ? (
          <View style={styles.block}>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              placeholder="Tu nombre"
              value={data.name}
              onChangeText={(name) => setData({ ...data, name })}
            />
            <Text style={styles.label}>Edad</Text>
            <TextInput
              style={styles.input}
              placeholder="Mínimo 16"
              keyboardType="number-pad"
              value={data.age ? String(data.age) : ''}
              onChangeText={(t) =>
                setData({ ...data, age: parseInt(t, 10) || 0 })
              }
            />
            <Text style={styles.label}>Ciudad</Text>
            <TextInput
              style={styles.input}
              placeholder="Ciudad"
              value={data.city}
              onChangeText={(city) => setData({ ...data, city })}
            />
            <Text style={styles.label}>WhatsApp</Text>
            <TextInput
              style={styles.input}
              placeholder="+569..."
              keyboardType="phone-pad"
              value={data.whatsappPhone}
              onChangeText={(whatsappPhone) => setData({ ...data, whatsappPhone })}
            />
            <Text style={styles.label}>Nivel</Text>
            {LEVELS.map((lvl) => (
              <Pressable
                key={lvl.value}
                style={[
                  styles.card,
                  data.level === lvl.value && styles.cardOn,
                ]}
                onPress={() => setData({ ...data, level: lvl.value })}
              >
                <Text
                  style={[
                    styles.cardTitle,
                    data.level === lvl.value && styles.cardTitleOn,
                  ]}
                >
                  {lvl.label}
                </Text>
                <Text style={styles.cardDesc}>{lvl.description}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.grid2}>
            {POSITIONS.map((pos) => (
              <Pressable
                key={pos.value}
                style={[
                  styles.tile,
                  data.position === pos.value && styles.tileOn,
                ]}
                onPress={() => setData({ ...data, position: pos.value })}
              >
                <Text
                  style={[
                    styles.tileText,
                    data.position === pos.value && styles.tileTextOn,
                  ]}
                >
                  {pos.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.grid2}>
            {DAYS.map((day) => {
              const on = data.availability.includes(day.toLowerCase())
              return (
                <Pressable
                  key={day}
                  style={[styles.tile, on && styles.tileOn]}
                  onPress={() => toggleAvailability(day)}
                >
                  <Text style={[styles.tileText, on && styles.tileTextOn]}>
                    {day}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.photoBlock}>
            <Pressable
              style={styles.photoCircle}
              onPress={() => void pickPhoto()}
              disabled={photoUploading}
            >
              {photoUploading ? (
                <ActivityIndicator size="large" />
              ) : data.photo ? (
                <Image source={{ uri: data.photo }} style={styles.photoImg} />
              ) : (
                <Text style={styles.photoPlaceholder}>📷</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => void pickPhoto()}
              disabled={photoUploading}
            >
              <Text style={styles.secondaryBtnText}>Elegir foto</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => setData({ ...data, photo: DEFAULT_AVATAR })}
              disabled={photoUploading}
            >
              <Text style={styles.secondaryBtnText}>Usar foto de ejemplo</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryBtn, (!canProceed() || submitting) && styles.disabled]}
          onPress={() => void handleNext()}
          disabled={!canProceed() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {step === totalSteps
                ? isEditMode
                  ? 'Guardar'
                  : 'Completar'
                : 'Continuar'}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  backText: { fontSize: 22, color: '#374151' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  dotFill: { backgroundColor: '#93c5fd' },
  dotActive: { width: 22, backgroundColor: '#2563eb' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  h1: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  sub: { fontSize: 15, opacity: 0.7, marginBottom: 20 },
  block: { gap: 0 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  card: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  cardOn: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  cardTitleOn: { color: '#1d4ed8' },
  cardDesc: { fontSize: 13, opacity: 0.65, marginTop: 4 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '47%',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  tileOn: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  tileText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  tileTextOn: { color: '#1d4ed8' },
  photoBlock: { alignItems: 'center', marginTop: 12 },
  photoCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#f9fafb',
  },
  photoImg: { width: '100%', height: '100%' },
  photoPlaceholder: { fontSize: 48, opacity: 0.35 },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabled: { opacity: 0.45 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
})
