import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { takeAndroidPendingImageAsset } from '../lib/android-image-picker-pending'
import { APP_LOGO } from '../lib/app-brand-assets'
import { useApp } from '../lib/app-provider'
import {
  ageFromBirthDate,
  birthDateToIso,
  buildWhatsappE164,
  defaultBirthDateForMinAge,
  formatBirthDateDisplay,
  isRealProfilePhoto,
  isValidBirthDateForMinAge,
  isValidWhatsappDigits,
  MIN_AGE,
  normalizeWhatsappDigits,
} from '../lib/onboarding-utils'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import {
  fetchGeoCities,
  fetchGeoCountries,
  fetchGeoRegions,
  type GeoCity,
  type GeoCountry,
  type GeoRegion,
} from '../lib/supabase/geo-queries'
import { uploadProfileAvatarFromUri } from '../lib/supabase/profile-photo'
import { useScreenTheme } from '../lib/theme-ui'
import type { Gender, Level, OnboardingData, Position } from '../lib/types'

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

const TOTAL_STEPS = 3

const STEP_META = [
  {
    stepLabel: 'Paso 1 de 3',
    title: '¡Arma tu perfil!',
    subtitle:
      'WhatsApp y género son obligatorios. Solo verás partidos de tu mismo género.',
  },
  {
    stepLabel: 'Paso 2 de 3',
    title: 'Nivel de juego y tu posición',
    subtitle: 'Así otros jugadores saben qué esperar en la cancha.',
  },
  {
    stepLabel: 'Paso 3 de 3',
    title: 'Disponibilidad y foto de perfil',
    subtitle: 'Elige cuándo puedes jugar y sube una foto (obligatoria).',
  },
] as const

function whatsappDigitsFromStored(stored: string): string {
  const digits = stored.replace(/\D/g, '')
  if (digits.startsWith('569') && digits.length >= 11) {
    return digits.slice(3, 11)
  }
  return normalizeWhatsappDigits(digits)
}

function birthDateFromAge(age: number): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - Math.max(MIN_AGE, age))
  return d
}

type GeoOption = { id: string; name: string }

function GeoSelectModal({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  theme,
  styles,
}: {
  visible: boolean
  title: string
  options: GeoOption[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
  theme: ReturnType<typeof useScreenTheme>
  styles: ReturnType<typeof createStyles>
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: theme.card }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item.id}
            style={styles.modalList}
            renderItem={({ item }) => {
              const selected = item.id === selectedId
              return (
                <Pressable
                  style={[
                    styles.modalRow,
                    selected && { backgroundColor: theme.selectedTint },
                  ]}
                  onPress={() => {
                    onSelect(item.id)
                    onClose()
                  }}
                >
                  <Text
                    style={[
                      styles.modalRowText,
                      { color: selected ? theme.link : theme.text },
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              )
            }}
          />
          <Pressable style={styles.modalCancel} onPress={onClose}>
            <Text style={[styles.modalCancelText, { color: theme.textMuted }]}>Cerrar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function OnboardingScreen() {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const {
    completeOnboarding,
    currentUser,
    onboardingSource,
    exitProfileEditor,
    logout,
  } = useApp()

  const [photoUploading, setPhotoUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState(1)
  const [stepError, setStepError] = useState<string | null>(null)
  const [birthDate, setBirthDate] = useState(defaultBirthDateForMinAge())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [whatsappDigits, setWhatsappDigits] = useState('')

  const [countries, setCountries] = useState<GeoCountry[]>([])
  const [regions, setRegions] = useState<GeoRegion[]>([])
  const [cities, setCities] = useState<GeoCity[]>([])
  const [countryId, setCountryId] = useState<string | null>(null)
  const [regionId, setRegionId] = useState<string | null>(null)
  const [cityId, setCityId] = useState<string | null>(null)
  const [geoModal, setGeoModal] = useState<'country' | 'region' | 'city' | null>(null)

  const [data, setData] = useState<OnboardingData>(() => ({
    name: '',
    age: MIN_AGE,
    birthDate: birthDateToIso(defaultBirthDateForMinAge()),
    gender: currentUser?.gender || 'male',
    whatsappPhone: '',
    position: 'mediocampista',
    level: 'intermedio',
    availability: [],
    city: 'Rancagua',
    cityId: null,
    photo: '',
  }))

  const isEditMode = onboardingSource === 'profile_edit'
  const meta = STEP_META[step - 1]

  const cancelProfileEdit = useCallback(() => {
    exitProfileEditor()
    router.replace('/perfil')
  }, [exitProfileEditor])

  useEffect(() => {
    if (!isEditMode || !currentUser) return
    const bd = birthDateFromAge(currentUser.age)
    setBirthDate(bd)
    setWhatsappDigits(whatsappDigitsFromStored(currentUser.whatsappPhone || ''))
    setData({
      name: currentUser.name,
      age: currentUser.age,
      birthDate: birthDateToIso(bd),
      gender: currentUser.gender,
      whatsappPhone: currentUser.whatsappPhone || '',
      position: currentUser.position,
      level: currentUser.level,
      availability: [...currentUser.availability],
      city: currentUser.city,
      cityId: currentUser.cityId ?? null,
      photo: currentUser.photo || '',
    })
    setCityId(currentUser.cityId ?? null)
    setStep(1)
  }, [isEditMode, currentUser?.id])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = getSupabase()
    void (async () => {
      const list = await fetchGeoCountries(supabase)
      setCountries(list)
      const chile = list.find((c) => c.isoCode === 'cl') ?? list[0]
      if (!chile) return
      setCountryId((prev) => prev ?? chile.id)
    })()
  }, [])

  useEffect(() => {
    if (!countryId || !isSupabaseConfigured()) return
    const supabase = getSupabase()
    void (async () => {
      const list = await fetchGeoRegions(supabase, countryId)
      setRegions(list)
      if (!regionId && list[0]) setRegionId(list[0].id)
    })()
  }, [countryId])

  useEffect(() => {
    if (!regionId || !isSupabaseConfigured()) return
    const supabase = getSupabase()
    void (async () => {
      const list = await fetchGeoCities(supabase, regionId)
      setCities(list)
      if (!cityId && list.length > 0) {
        const rancagua = list.find((c) => c.name.toLowerCase() === 'rancagua')
        const pick = rancagua ?? list[0]
        setCityId(pick.id)
        setData((prev) => ({ ...prev, city: pick.name, cityId: pick.id }))
      }
    })()
  }, [regionId])

  const uploadAvatarFromAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      if (!currentUser || !isSupabaseConfigured()) {
        Alert.alert('Configura Supabase para subir fotos.')
        return
      }
      setPhotoUploading(true)
      try {
        const supabase = getSupabase()
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
        setStepError(null)
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
    setData((prev) => {
      const availability = prev.availability.includes(dayLower)
        ? prev.availability.filter((d) => d !== dayLower)
        : [...prev.availability, dayLower]
      return { ...prev, availability }
    })
    setStepError(null)
  }

  const validateStep = (s: number): string | null => {
    switch (s) {
      case 1: {
        if (data.name.trim().length < 2) {
          return 'Ingresa tu nombre o apodo (mínimo 2 caracteres).'
        }
        if (!isValidBirthDateForMinAge(birthDate)) {
          return `Debes tener al menos ${MIN_AGE} años.`
        }
        if (!isValidWhatsappDigits(whatsappDigits)) {
          return 'Ingresa los 8 dígitos de tu celular chileno.'
        }
        if (!cityId) {
          return 'Selecciona país, región y ciudad.'
        }
        return null
      }
      case 2:
        return null
      case 3: {
        if (data.availability.length === 0) {
          return 'Selecciona al menos un día disponible.'
        }
        if (!isRealProfilePhoto(data.photo)) {
          return 'Sube una foto de perfil para continuar.'
        }
        return null
      }
      default:
        return null
    }
  }

  const canProceed = () => validateStep(step) === null

  const handleNext = async () => {
    const err = validateStep(step)
    if (err) {
      setStepError(err)
      return
    }
    setStepError(null)

    if (step < TOTAL_STEPS) {
      setStep(step + 1)
      return
    }

    const wa = buildWhatsappE164(whatsappDigits)
    const payload: OnboardingData = {
      ...data,
      name: data.name.trim(),
      birthDate: birthDateToIso(birthDate),
      age: ageFromBirthDate(birthDate),
      whatsappPhone: wa,
      cityId,
      photo: data.photo.trim(),
    }

    setSubmitting(true)
    try {
      const res = await completeOnboarding(payload)
      if (!res.ok && res.error) {
        Alert.alert('No se pudo guardar', res.error)
        return
      }
      if (isEditMode) {
        router.replace('/perfil')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    setStepError(null)
    if (step > 1) {
      setStep(step - 1)
      return
    }
    if (isEditMode) {
      cancelProfileEdit()
      return
    }
    Alert.alert('Salir', '¿Cerrar sesión para usar otra cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void logout() },
    ])
  }

  const onBirthDateChange = (_: unknown, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false)
    if (!selected) return
    setBirthDate(selected)
    setData((prev) => ({
      ...prev,
      birthDate: birthDateToIso(selected),
      age: ageFromBirthDate(selected),
    }))
    setStepError(null)
  }

  const countryName = countries.find((c) => c.id === countryId)?.name ?? 'Selecciona país'
  const regionName = regions.find((r) => r.id === regionId)?.name ?? 'Selecciona región'
  const cityName = cities.find((c) => c.id === cityId)?.name ?? 'Selecciona ciudad'

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg }}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            style={styles.headerSideBtn}
            accessibilityRole="button"
            accessibilityLabel={isEditMode && step === 1 ? 'Cancelar edición' : 'Volver'}
          >
            {isEditMode && step === 1 ? (
              <>
                <Ionicons name="close" size={20} color={theme.text} />
                <Text style={[styles.headerCancelLabel, { color: theme.text }]}>
                  Cancelar
                </Text>
              </>
            ) : (
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            )}
          </Pressable>

          <View style={styles.progressRow}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressSeg,
                  {
                    backgroundColor:
                      i < step ? theme.primary : theme.border,
                  },
                ]}
              />
            ))}
          </View>

          {isEditMode && step > 1 ? (
            <Pressable
              onPress={cancelProfileEdit}
              hitSlop={12}
              style={[styles.headerSideBtn, styles.headerSideBtnEnd]}
              accessibilityRole="button"
              accessibilityLabel="Cancelar edición"
            >
              <Text style={[styles.headerCancelLabel, { color: theme.danger }]}>
                Cancelar
              </Text>
            </Pressable>
          ) : (
            <View style={styles.headerSideBtn} />
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <Image
            source={APP_LOGO}
            style={styles.heroImage}
            contentFit="contain"
          />
          <View style={styles.heroOverlay} />
          <View style={styles.heroTextWrap}>
            <View style={styles.stepPill}>
              <Ionicons name="sparkles" size={12} color={theme.primary} />
              <Text style={[styles.stepPillText, { color: theme.primary }]}>
                {meta.stepLabel}
              </Text>
            </View>
            <Text style={styles.heroTitle}>
              {isEditMode && step === 1 ? 'Editar perfil' : meta.title}
            </Text>
          </View>
        </View>

        <Text style={[styles.intro, { color: theme.textMuted }]}>{meta.subtitle}</Text>

        {step === 1 ? (
          <View style={styles.block}>
            <FieldLabel icon="person-outline" text="Nombre o apodo (como te dicen en la cancha)" />
            <TextInput
              style={styles.input}
              placeholder="Ej: Pipa, Chino, Pancho…"
              placeholderTextColor={theme.textMuted}
              value={data.name}
              onChangeText={(name) => {
                setData({ ...data, name })
                setStepError(null)
              }}
            />

            <FieldLabel icon="calendar-outline" text="Fecha de nacimiento" />
            <Pressable
              style={styles.inputRow}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.inputRowText}>{formatBirthDateDisplay(birthDate)}</Text>
              <Ionicons name="calendar" size={20} color={theme.textMuted} />
            </Pressable>
            <Text style={styles.hint}>Edad mínima {MIN_AGE} años</Text>
            {showDatePicker ? (
              <DateTimePicker
                value={birthDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={onBirthDateChange}
              />
            ) : null}

            <FieldLabel icon="logo-whatsapp" text="WhatsApp (obligatorio)" />
            <View style={styles.waRow}>
              <View style={styles.waPrefix}>
                <Text style={styles.waPrefixText}>+569</Text>
              </View>
              <TextInput
                style={[styles.input, styles.waInput]}
                placeholder="12345678"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                maxLength={8}
                value={whatsappDigits}
                onChangeText={(t) => {
                  setWhatsappDigits(normalizeWhatsappDigits(t))
                  setStepError(null)
                }}
              />
            </View>
            <Text style={styles.hint}>
              Solo los 8 dígitos de tu celular (Chile). Lo usaremos para coordinar partidos.
            </Text>

            <FieldLabel icon="male-female-outline" text="Género" />
            <View style={styles.genderRow}>
              {(
                [
                  { value: 'male' as Gender, label: 'Masculino', icon: 'man' as const },
                  { value: 'female' as Gender, label: 'Femenino', icon: 'woman' as const },
                ] as const
              ).map((g) => {
                const on = data.gender === g.value
                return (
                  <Pressable
                    key={g.value}
                    style={[styles.genderCard, on && styles.genderCardOn]}
                    onPress={() => {
                      setData({ ...data, gender: g.value })
                      setStepError(null)
                    }}
                  >
                    <Ionicons
                      name={g.icon}
                      size={28}
                      color={on ? theme.primary : theme.textMuted}
                    />
                    <Text style={[styles.genderLabel, on && styles.genderLabelOn]}>
                      {g.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Text style={styles.hint}>
              Solo verás partidos de tu género. No podrás cambiarlo después.
            </Text>

            <FieldLabel icon="location-outline" text="Ciudad / ubicación" />
            <Pressable style={styles.select} onPress={() => setGeoModal('country')}>
              <Text style={styles.selectText}>{countryName}</Text>
              <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
            </Pressable>
            <Pressable
              style={styles.select}
              onPress={() => countryId && setGeoModal('region')}
              disabled={!countryId}
            >
              <Text style={styles.selectText}>{regionName}</Text>
              <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
            </Pressable>
            <Pressable
              style={styles.select}
              onPress={() => regionId && setGeoModal('city')}
              disabled={!regionId}
            >
              <Text style={styles.selectText}>{cityName}</Text>
              <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.block}>
            <FieldLabel icon="star-outline" text="Nivel de juego" />
            {LEVELS.map((lvl) => {
              const on = data.level === lvl.value
              return (
                <Pressable
                  key={lvl.value}
                  style={[styles.levelCard, on && styles.levelCardOn]}
                  onPress={() => setData({ ...data, level: lvl.value })}
                >
                  <Text style={[styles.levelTitle, on && styles.levelTitleOn]}>
                    {lvl.label}
                  </Text>
                  <Text style={styles.levelDesc}>{lvl.description}</Text>
                </Pressable>
              )
            })}

            <FieldLabel icon="football-outline" text="Posición en cancha" />
            <View style={styles.grid2}>
              {POSITIONS.map((pos) => {
                const on = data.position === pos.value
                return (
                  <Pressable
                    key={pos.value}
                    style={[styles.posTile, on && styles.posTileOn]}
                    onPress={() => setData({ ...data, position: pos.value })}
                  >
                    <Text style={[styles.posText, on && styles.posTextOn]}>{pos.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.block}>
            <FieldLabel icon="time-outline" text="Días disponibles" />
            <View style={styles.grid2}>
              {DAYS.map((day) => {
                const on = data.availability.includes(day.toLowerCase())
                return (
                  <Pressable
                    key={day}
                    style={[styles.dayTile, on && styles.dayTileOn]}
                    onPress={() => toggleAvailability(day)}
                  >
                    <Text style={[styles.dayText, on && styles.dayTextOn]}>{day}</Text>
                  </Pressable>
                )
              })}
            </View>

            <FieldLabel icon="camera-outline" text="Foto de perfil (obligatoria)" />
            <View style={styles.photoWrap}>
              <Pressable
                style={styles.photoCircle}
                onPress={() => void pickPhoto()}
                disabled={photoUploading}
              >
                {photoUploading ? (
                  <ActivityIndicator size="large" color={theme.primary} />
                ) : data.photo ? (
                  <Image source={{ uri: data.photo }} style={styles.photoImg} contentFit="cover" />
                ) : (
                  <Ionicons name="camera-outline" size={40} color={theme.textMuted} />
                )}
                <View style={styles.photoFab}>
                  <Ionicons name="image" size={16} color="#fff" />
                </View>
              </Pressable>
              <Pressable
                style={styles.choosePhotoBtn}
                onPress={() => void pickPhoto()}
                disabled={photoUploading}
              >
                <Ionicons name="images-outline" size={18} color="#fff" />
                <Text style={styles.choosePhotoText}>Elegir foto</Text>
              </Pressable>
              <Text style={styles.photoHint}>
                Sube la foto de tu ídolo o una foto de perfil tuya.
              </Text>
            </View>

            <Text style={[styles.activateHint, { color: theme.primary }]}>
              Activa tus días y tu foto para salir a la cancha
            </Text>
          </View>
        ) : null}

        {stepError ? <Text style={styles.errorText}>{stepError}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
        <Pressable
          style={[styles.primaryBtn, (!canProceed() || submitting) && styles.disabled]}
          onPress={() => void handleNext()}
          disabled={!canProceed() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color={theme.primaryBtnText} />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>
                {step === TOTAL_STEPS
                  ? isEditMode
                    ? 'Guardar'
                    : 'Completar'
                  : 'Continuar'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={theme.primaryBtnText} />
            </>
          )}
        </Pressable>
      </View>

      <GeoSelectModal
        visible={geoModal === 'country'}
        title="País"
        options={countries}
        selectedId={countryId}
        onSelect={(id) => {
          setCountryId(id)
          setRegionId(null)
          setCityId(null)
          setCities([])
        }}
        onClose={() => setGeoModal(null)}
        theme={theme}
        styles={styles}
      />
      <GeoSelectModal
        visible={geoModal === 'region'}
        title="Región"
        options={regions}
        selectedId={regionId}
        onSelect={(id) => {
          setRegionId(id)
          setCityId(null)
        }}
        onClose={() => setGeoModal(null)}
        theme={theme}
        styles={styles}
      />
      <GeoSelectModal
        visible={geoModal === 'city'}
        title="Ciudad"
        options={cities}
        selectedId={cityId}
        onSelect={(id) => {
          setCityId(id)
          const city = cities.find((c) => c.id === id)
          if (city) {
            setData((prev) => ({ ...prev, city: city.name, cityId: city.id }))
          }
        }}
        onClose={() => setGeoModal(null)}
        theme={theme}
        styles={styles}
      />
    </KeyboardAvoidingView>
  )
}

function FieldLabel({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={fieldStyles.row}>
      <Ionicons name={icon} size={16} color="#2F6B3E" />
      <Text style={fieldStyles.text}>{text}</Text>
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  text: { fontSize: 14, fontWeight: '600', color: '#1F2A22', flex: 1 },
})

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  const fieldBg = theme.isDark ? 'rgba(255,255,255,0.08)' : '#E8F4EA'
  return StyleSheet.create({
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerSideBtn: {
      minWidth: 88,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 4,
      paddingHorizontal: 4,
    },
    headerSideBtnEnd: {
      justifyContent: 'flex-end',
    },
    headerCancelLabel: {
      fontSize: 15,
      fontWeight: '700',
    },
    progressRow: { flex: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 8 },
    progressSeg: { flex: 1, height: 4, borderRadius: 2 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
    heroCard: {
      borderRadius: 16,
      overflow: 'hidden',
      height: 140,
      marginBottom: 12,
      backgroundColor: '#000',
    },
    heroImage: { ...StyleSheet.absoluteFillObject },
    heroOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.55)',
    },
    heroTextWrap: { flex: 1, justifyContent: 'flex-end', padding: 14 },
    stepPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      marginBottom: 6,
    },
    stepPillText: { fontSize: 12, fontWeight: '700' },
    heroTitle: { fontSize: 22, fontWeight: '800', color: '#1F2A22' },
    intro: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
    block: { gap: 0 },
    input: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 16,
      backgroundColor: fieldBg,
      color: theme.text,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: fieldBg,
    },
    inputRowText: { fontSize: 16, color: theme.text },
    hint: { fontSize: 12, color: theme.textMuted, marginTop: 6, lineHeight: 17 },
    waRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
    waPrefix: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      backgroundColor: fieldBg,
      paddingHorizontal: 14,
      justifyContent: 'center',
    },
    waPrefixText: { fontSize: 16, fontWeight: '600', color: theme.text },
    waInput: { flex: 1 },
    genderRow: { flexDirection: 'row', gap: 10 },
    genderCard: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 16,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: fieldBg,
    },
    genderCardOn: { borderColor: theme.primary, backgroundColor: theme.selectedTint },
    genderLabel: { marginTop: 6, fontSize: 15, fontWeight: '600', color: theme.textMuted },
    genderLabelOn: { color: theme.primary },
    select: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: fieldBg,
      marginBottom: 8,
    },
    selectText: { fontSize: 16, color: theme.text, flex: 1 },
    levelCard: {
      borderWidth: 2,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      backgroundColor: fieldBg,
    },
    levelCardOn: { borderColor: theme.primary, backgroundColor: theme.selectedTint },
    levelTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    levelTitleOn: { color: theme.primary },
    levelDesc: { fontSize: 13, color: theme.textMuted, marginTop: 4 },
    grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    posTile: {
      width: '47%',
      paddingVertical: 18,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      backgroundColor: fieldBg,
    },
    posTileOn: { borderColor: theme.primary, backgroundColor: theme.selectedTint },
    posText: { fontSize: 15, fontWeight: '600', color: theme.text },
    posTextOn: { color: theme.primary },
    dayTile: {
      width: '47%',
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      backgroundColor: fieldBg,
    },
    dayTileOn: { borderColor: theme.primary, backgroundColor: theme.selectedTint },
    dayText: { fontSize: 14, fontWeight: '600', color: theme.text },
    dayTextOn: { color: theme.primary },
    photoWrap: { alignItems: 'center', marginTop: 8 },
    photoCircle: {
      width: 140,
      height: 140,
      borderRadius: 70,
      borderWidth: 2,
      borderColor: theme.primary,
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      backgroundColor: fieldBg,
    },
    photoImg: { width: '100%', height: '100%' },
    photoFab: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choosePhotoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
      backgroundColor: theme.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    choosePhotoText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    photoHint: {
      marginTop: 10,
      fontSize: 13,
      color: '#B45309',
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    activateHint: {
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '700',
      marginTop: 20,
    },
    errorText: {
      color: theme.danger,
      fontSize: 14,
      marginTop: 12,
      textAlign: 'center',
    },
    footer: {
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    disabled: { opacity: 0.45 },
    primaryBtnText: { color: theme.primaryBtnText, fontSize: 17, fontWeight: '700' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      maxHeight: '70%',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 16,
      paddingBottom: 24,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    modalList: { maxHeight: 360 },
    modalRow: { paddingVertical: 14, paddingHorizontal: 20 },
    modalRowText: { fontSize: 16 },
    modalCancel: { alignItems: 'center', paddingTop: 12 },
    modalCancelText: { fontSize: 16, fontWeight: '600' },
  })
}
