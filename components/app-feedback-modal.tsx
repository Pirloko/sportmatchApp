import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  APP_FEEDBACK_MAX_LENGTH,
  submitAppUserFeedback,
} from '../lib/supabase/app-feedback-queries'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import type { ScreenTheme } from '../lib/theme-ui'

type Props = {
  visible: boolean
  userId: string | undefined
  theme: ScreenTheme
  onClose: () => void
}

type FeedbackKind = 'suggestion' | 'opinion' | 'bug'

const KIND_OPTIONS: {
  id: FeedbackKind
  label: string
  icon: keyof typeof Ionicons.glyphMap
}[] = [
  { id: 'suggestion', label: 'Sugerencia', icon: 'bulb-outline' },
  { id: 'opinion', label: 'Opinión', icon: 'heart-outline' },
  { id: 'bug', label: 'Error', icon: 'bug-outline' },
]

const KIND_PREFIX: Record<FeedbackKind, string> = {
  suggestion: '[Sugerencia] ',
  opinion: '[Opinión] ',
  bug: '[Error] ',
}

function buildMessageBody(kind: FeedbackKind | null, message: string): string {
  const trimmed = message.trim()
  if (!kind) return trimmed
  const prefix = KIND_PREFIX[kind]
  if (trimmed.startsWith(prefix)) return trimmed
  return `${prefix}${trimmed}`
}

type FeedbackPhase = 'form' | 'success' | 'error'

function FeedbackSuccessPanel({
  theme,
  onDone,
}: {
  theme: ScreenTheme
  onDone: () => void
}) {
  const successBg = theme.isDark ? 'rgba(102, 208, 111, 0.14)' : 'rgba(15, 69, 57, 0.1)'
  const successBorder = theme.isDark ? 'rgba(102, 208, 111, 0.35)' : 'rgba(15, 69, 57, 0.2)'
  const ringOuter = theme.isDark ? 'rgba(102, 208, 111, 0.22)' : 'rgba(15, 69, 57, 0.12)'

  return (
    <View style={styles.successRoot}>
      <View style={[styles.successRingOuter, { backgroundColor: ringOuter }]}>
        <View
          style={[
            styles.successRingInner,
            { backgroundColor: successBg, borderColor: successBorder },
          ]}
        >
          <Ionicons name="checkmark" size={42} color={theme.primaryAccent} />
        </View>
      </View>

      <Text style={[styles.successKicker, { color: theme.primaryAccent }]}>
        MENSAJE RECIBIDO
      </Text>
      <Text style={[styles.successTitle, { color: theme.text }]}>
        ¡Gracias por escribirnos!
      </Text>
      <Text style={[styles.successDesc, { color: theme.textMuted }]}>
        Tu comentario ya está con nuestro equipo. Lo revisaremos y usará para mejorar SportMatch.
      </Text>

      <View
        style={[
          styles.successCard,
          { backgroundColor: theme.inputBg, borderColor: theme.border },
        ]}
      >
        <View style={styles.successStep}>
          <View style={[styles.successStepDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.successStepText, { color: theme.textMuted }]}>
            Validamos y clasificamos tu mensaje
          </Text>
        </View>
        <View style={styles.successStep}>
          <View style={[styles.successStepDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.successStepText, { color: theme.textMuted }]}>
            Priorizamos mejoras y correcciones
          </Text>
        </View>
        <View style={styles.successStep}>
          <View style={[styles.successStepDot, { backgroundColor: theme.primaryAccent }]} />
          <Text style={[styles.successStepText, { color: theme.textMuted }]}>
            Seguimos construyendo contigo
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onDone}
        style={({ pressed }) => [
          styles.submitBtn,
          {
            backgroundColor: theme.primary,
            marginTop: 22,
            opacity: pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
      >
        <Text style={[styles.submitText, { color: theme.primaryBtnText }]}>Entendido</Text>
      </Pressable>
    </View>
  )
}

function FeedbackErrorBanner({
  theme,
  message,
  onRetry,
}: {
  theme: ScreenTheme
  message: string
  onRetry: () => void
}) {
  return (
    <View
      style={[
        styles.errorBanner,
        { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
      ]}
    >
      <Ionicons name="alert-circle" size={20} color={theme.dangerOnSurface} />
      <View style={styles.errorCopy}>
        <Text style={[styles.errorTitle, { color: theme.dangerOnSurface }]}>
          No se pudo enviar
        </Text>
        <Text style={[styles.errorBody, { color: theme.textMuted }]}>{message}</Text>
      </View>
      <Pressable onPress={onRetry} hitSlop={8}>
        <Text style={[styles.errorRetry, { color: theme.primaryAccent }]}>Reintentar</Text>
      </Pressable>
    </View>
  )
}

export function AppFeedbackModal({ visible, userId, theme, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const [phase, setPhase] = useState<FeedbackPhase>('form')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState<FeedbackKind | null>(null)
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!visible) {
      setPhase('form')
      setErrorMessage(null)
      setMessage('')
      setKind(null)
      setFocused(false)
      setBusy(false)
    }
  }, [visible])

  const ui = useMemo(
    () => ({
      heroBg: theme.isDark ? 'rgba(102, 208, 111, 0.12)' : 'rgba(15, 69, 57, 0.08)',
      heroBorder: theme.isDark ? 'rgba(102, 208, 111, 0.28)' : 'rgba(15, 69, 57, 0.16)',
      chipIdleBg: theme.chipBg,
      chipIdleBorder: theme.chipBorder,
      sheetBorder: theme.modalSheetTopBorder,
      inputBorder: focused ? theme.primary : theme.inputBorder,
      inputBorderWidth: focused ? 2 : 1,
      shadow: theme.isDark
        ? { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 }
        : { shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 14 },
    }),
    [theme, focused]
  )

  const close = () => {
    if (busy) return
    setPhase('form')
    setErrorMessage(null)
    setMessage('')
    setKind(null)
    setFocused(false)
    onClose()
  }

  const onSubmit = async () => {
    if (!userId || !isSupabaseConfigured()) {
      Alert.alert('Sin conexión', 'Inicia sesión para enviar tu comentario.')
      return
    }

    setBusy(true)
    setErrorMessage(null)
    try {
      const supabase = getSupabase()
      const body = buildMessageBody(kind, message)
      const res = await submitAppUserFeedback(supabase, userId, body)
      if (!res.ok) {
        setPhase('error')
        setErrorMessage(res.error)
        return
      }
      setMessage('')
      setKind(null)
      setFocused(false)
      setPhase('success')
    } finally {
      setBusy(false)
    }
  }

  const charCount = message.length
  const canSubmit = message.trim().length > 0 && !busy

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.overlay }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityLabel="Cerrar"
        />

        <View
          style={[
            styles.sheet,
            ui.shadow,
            {
              backgroundColor: theme.card,
              borderTopColor: ui.sheetBorder,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          {phase === 'success' ? (
            <FeedbackSuccessPanel theme={theme} onDone={close} />
          ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {phase === 'error' && errorMessage ? (
              <FeedbackErrorBanner
                theme={theme}
                message={errorMessage}
                onRetry={() => {
                  setPhase('form')
                  setErrorMessage(null)
                }}
              />
            ) : null}

            <View
              style={[
                styles.hero,
                { backgroundColor: ui.heroBg, borderColor: ui.heroBorder },
              ]}
            >
              <View
                style={[
                  styles.heroIcon,
                  { backgroundColor: theme.selectedTint, borderColor: ui.heroBorder },
                ]}
              >
                <Ionicons name="chatbubbles" size={26} color={theme.primaryAccent} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={[styles.kicker, { color: theme.primaryAccent }]}>
                  TU VOZ IMPORTA
                </Text>
                <Text style={[styles.title, { color: theme.text }]}>
                  Sugerencias, opiniones y errores
                </Text>
                <Text style={[styles.desc, { color: theme.textMuted }]}>
                  Ayúdanos a mejorar SportMatch. Cada mensaje lo lee nuestro equipo.
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              TIPO DE COMENTARIO
            </Text>
            <View style={styles.kindRow}>
              {KIND_OPTIONS.map((opt) => {
                const selected = kind === opt.id
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setKind(selected ? null : opt.id)}
                    style={[
                      styles.kindChip,
                      {
                        backgroundColor: selected ? theme.selectedTint : ui.chipIdleBg,
                        borderColor: selected ? theme.primary : ui.chipIdleBorder,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={selected ? theme.primaryAccent : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.kindLabel,
                        { color: selected ? theme.primaryAccent : theme.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: 18 }]}>
              MENSAJE
            </Text>
            <View
              style={[
                styles.inputShell,
                {
                  borderColor: ui.inputBorder,
                  borderWidth: ui.inputBorderWidth,
                  backgroundColor: theme.inputBg,
                },
              ]}
            >
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={
                  kind === 'bug'
                    ? 'Describe qué pasó y en qué pantalla…'
                    : kind === 'suggestion'
                      ? '¿Qué te gustaría que agregáramos o mejoráramos?'
                      : 'Cuéntanos con detalle…'
                }
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={APP_FEEDBACK_MAX_LENGTH}
                editable={!busy}
                textAlignVertical="top"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={[styles.input, { color: theme.text }]}
              />
              <View style={[styles.inputFooter, { borderTopColor: theme.border }]}>
                <View style={styles.inputHint}>
                  <Ionicons name="shield-checkmark-outline" size={13} color={theme.textMuted} />
                  <Text style={[styles.inputHintText, { color: theme.textMuted }]}>
                    Uso interno del equipo
                  </Text>
                </View>
                <Text
                  style={[
                    styles.counter,
                    {
                      color:
                        charCount > APP_FEEDBACK_MAX_LENGTH - 120
                          ? theme.danger
                          : theme.textMuted,
                    },
                  ]}
                >
                  {charCount}/{APP_FEEDBACK_MAX_LENGTH}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => void onSubmit()}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                {
                  backgroundColor: theme.primary,
                  opacity: !canSubmit ? 0.45 : pressed ? 0.92 : 1,
                  transform: [{ scale: pressed && canSubmit ? 0.985 : 1 }],
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.primaryBtnText} size="small" />
              ) : (
                <>
                  <View
                    style={[
                      styles.submitIconWrap,
                      { backgroundColor: 'rgba(255,255,255,0.18)' },
                    ]}
                  >
                    <Ionicons name="paper-plane" size={17} color={theme.primaryBtnText} />
                  </View>
                  <Text style={[styles.submitText, { color: theme.primaryBtnText }]}>
                    Enviar comentario
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.cancelBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={close}
              disabled={busy}
            >
              <Text style={[styles.cancelText, { color: theme.textMuted }]}>Cancelar</Text>
            </Pressable>
          </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 14,
  },
  hero: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  desc: {
    fontSize: 13,
    marginTop: 5,
    lineHeight: 19,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 10,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  kindLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputShell: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  input: {
    minHeight: 148,
    maxHeight: 200,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    fontSize: 15,
    lineHeight: 22,
  },
  inputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inputHintText: {
    fontSize: 11,
    fontWeight: '600',
  },
  counter: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  submitBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: 14,
  },
  submitIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cancelBtn: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  successRoot: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  successRingOuter: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successRingInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successKicker: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 30,
  },
  successDesc: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 6,
  },
  successCard: {
    width: '100%',
    marginTop: 20,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  successStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  successStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  successStepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  errorCopy: {
    flex: 1,
    minWidth: 0,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  errorBody: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  errorRetry: {
    fontSize: 13,
    fontWeight: '800',
  },
})
