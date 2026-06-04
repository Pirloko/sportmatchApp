import { useMemo, useState } from 'react'
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

import { useApp } from '../lib/app-provider'
import { useScreenTheme } from '../lib/theme-ui'

export function VenueOnboardingScreen() {
  const { logout, completeVenueOnboarding } = useApp()
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    city: 'Rancagua',
    mapsUrl: '',
    slotDurationMinutes: 60,
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.address.trim() || !form.phone.trim()) {
      Alert.alert('Completa nombre, dirección y teléfono.')
      return
    }
    setSubmitting(true)
    try {
      const res = await completeVenueOnboarding({
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || 'Rancagua',
        mapsUrl: form.mapsUrl.trim() || null,
        slotDurationMinutes: Math.min(
          180,
          Math.max(15, Math.round(Number(form.slotDurationMinutes)) || 60)
        ),
      })
      if (!res.ok && res.error) {
        Alert.alert('Error', res.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={() => void logout()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>← Salir</Text>
        </Pressable>
        <View>
          <Text style={styles.h1}>Alta de centro</Text>
          <Text style={styles.hint}>Datos públicos de tu recinto</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Nombre del centro</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Club San Lorenzo"
          placeholderTextColor={theme.textMuted}
          value={form.name}
          onChangeText={(name) => setForm({ ...form, name })}
        />

        <Text style={styles.label}>Dirección</Text>
        <TextInput
          style={styles.input}
          placeholder="Calle y número"
          placeholderTextColor={theme.textMuted}
          value={form.address}
          onChangeText={(address) => setForm({ ...form, address })}
        />

        <Text style={styles.label}>Ciudad</Text>
        <TextInput
          style={styles.input}
          value={form.city}
          placeholderTextColor={theme.textMuted}
          onChangeText={(city) => setForm({ ...form, city })}
        />

        <Text style={styles.label}>Teléfono</Text>
        <TextInput
          style={styles.input}
          placeholder="+56..."
          placeholderTextColor={theme.textMuted}
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(phone) => setForm({ ...form, phone })}
        />

        <Text style={styles.label}>Google Maps (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="https://maps.app.goo.gl/..."
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          value={form.mapsUrl}
          onChangeText={(mapsUrl) => setForm({ ...form, mapsUrl })}
        />

        <Text style={styles.label}>Duración tramo (min)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          placeholderTextColor={theme.textMuted}
          value={String(form.slotDurationMinutes)}
          onChangeText={(t) =>
            setForm({
              ...form,
              slotDurationMinutes: Number(t) || 60,
            })
          }
        />
        <Text style={styles.help}>
          Entre 15 y 180 minutos; usado para huecos de reserva.
        </Text>

        <Pressable
          style={[styles.submit, submitting && styles.submitDisabled]}
          onPress={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={theme.primaryBtnText} />
          ) : (
            <Text style={styles.submitText}>Crear mi centro</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    header: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
      gap: 8,
    },
    backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
    backText: { fontSize: 16, color: theme.link },
    h1: { fontSize: 20, fontWeight: '700', color: theme.text },
    hint: { fontSize: 13, color: theme.textMuted },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 40 },
    label: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 6,
      marginTop: 12,
      color: theme.text,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: theme.inputBg,
      color: theme.text,
    },
    help: { fontSize: 12, color: theme.textMuted, marginTop: 6 },
    submit: {
      marginTop: 28,
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { color: theme.primaryBtnText, fontSize: 17, fontWeight: '600' },
  })
}
