import { Ionicons } from '@expo/vector-icons'
import { Link } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useApp } from '../lib/app-provider'
import { useThemePreference } from '../lib/theme-context'
import type { Gender } from '../lib/types'

export function AuthScreen() {
  const { login, loginWithGoogle } = useApp()
  const { resolved, setPreference, tokens } = useThemePreference()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [gender] = useState<Gender>('male')
  const [isSignUp, setIsSignUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false)
  const floatAnim = useRef(new Animated.Value(0)).current
  const isDark = resolved === 'dark'
  const colors = isDark
    ? {
        bg: '#090B0A',
        text: '#F5F7F7',
        textMuted: '#9CA3A3',
        border: '#2C3131',
        surface: '#141717',
        icon: '#F5F7F7',
        divider: '#2C3131',
      }
    : {
        bg: '#F3F6F2',
        text: '#222524',
        textMuted: '#6E7672',
        border: '#D2D9D2',
        surface: '#EDF2EC',
        icon: '#6E7672',
        divider: '#D8DDD8',
      }
  const marketingColors = isDark
    ? {
        cardBg: '#05090d',
        cardBorder: 'rgba(129, 140, 148, 0.24)',
        iconBg: 'rgba(15, 69, 57, 0.2)',
        icon: '#0F4539',
        title: '#f3f4f6',
        body: '#9ca3af',
        statsBg: '#0a0e12',
        statsBorder: 'rgba(255,255,255,0.12)',
        statNum: '#f4c84f',
        statLabel: '#9ca3af',
        footerBrand: '#e5e7eb',
        footerNote: '#9ca3af',
      }
    : {
        cardBg: '#F6F8F5',
        cardBorder: '#C8D0C8',
        iconBg: 'rgba(15, 69, 57, 0.18)',
        icon: '#0F4539',
        title: '#212524',
        body: '#5f6663',
        statsBg: '#ECEFED',
        statsBorder: '#C8D0C8',
        statNum: '#B58900',
        statLabel: '#5f6663',
        footerBrand: '#222524',
        footerNote: '#5f6663',
      }

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled)
    })
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled
    )
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  useEffect(() => {
    if (reduceMotionEnabled) {
      floatAnim.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 1750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [floatAnim, reduceMotionEnabled])

  const onSubmit = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await login(
        email,
        password,
        gender,
        isSignUp,
        isSignUp ? whatsapp : undefined
      )
      if (!res.ok && res.error) {
        setError(res.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const onGoogleAuth = async () => {
    setError(null)
    setGoogleBusy(true)
    try {
      const res = await loginWithGoogle(isSignUp)
      if (!res.ok && res.error) {
        setError(res.error)
      }
    } finally {
      setGoogleBusy(false)
    }
  }

  const onToggleTheme = () => {
    void setPreference(isDark ? 'light' : 'dark')
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <View style={styles.iconBtn} />
            <Text style={[styles.brand, { color: colors.text }]}>SPORTMATCH</Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={onToggleTheme}>
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={18}
              color={colors.icon}
            />
          </Pressable>
        </View>

        <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatAnim }] }]}>
          <Image
            source={require('../assets/sportmatch-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {isSignUp ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Crear cuenta</Text>
            <Text style={[styles.hintSignUp, { color: colors.textMuted }]}>
              Regístrate con email o Google. Luego completarás WhatsApp y género en el
              siguiente paso.
            </Text>
          </>
        ) : (
          <Text style={[styles.hint, { color: colors.text }]}>
            Ingresa tus datos para iniciar sesión o inicia sesión con Google.
          </Text>
        )}

        <Pressable
          style={[
            styles.socialBtn,
            { borderColor: colors.border, backgroundColor: colors.surface },
            googleBusy && styles.primaryDisabled,
          ]}
          onPress={() => void onGoogleAuth()}
          disabled={googleBusy || busy}
        >
          {googleBusy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={colors.text} />
              <Text style={[styles.socialText, { color: colors.text }]}>
                {isSignUp ? 'Crear cuenta con Google' : 'Continuar con Google'}
              </Text>
            </>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.divider }]} />
          <Text style={[styles.dividerText, { color: colors.textMuted }]}>o con email</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.divider }]} />
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Email</Text>
        <View style={styles.inputWrap}>
          <Ionicons
            name="mail-outline"
            size={18}
            color={colors.textMuted}
            style={styles.inputIcon}
          />
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                color: colors.text,
              },
            ]}
            placeholder="tu@email.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />
        </View>
        <Text style={[styles.label, { color: colors.text }]}>Contrasena</Text>
        <View style={styles.inputWrap}>
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={colors.textMuted}
            style={styles.inputIcon}
          />
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                color: colors.text,
              },
            ]}
            placeholder="Tu contrasena"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {isSignUp ? (
          <Text style={[styles.helperText, { color: colors.textMuted }]}>
            Mínimo 6 caracteres (o el mínimo que definas en Supabase → Authentication →
            Providers).
          </Text>
        ) : null}

        <Pressable
          style={[
            styles.primary,
            { backgroundColor: tokens.primaryGreen },
            busy && styles.primaryDisabled,
          ]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.primaryText, { color: '#FFFFFF' }]}>
              {isSignUp ? 'Crear cuenta' : 'Iniciar sesion'}
            </Text>
          )}
        </Pressable>

        <Text style={[styles.legalText, { color: colors.textMuted }]}>
          Al continuar aceptas nuestros{' '}
          <Link href="/terms" style={[styles.legalLink, { color: tokens.primaryGreen }]}>
            Términos de Uso
          </Link>{' '}
          y{' '}
          <Link
            href="/privacy-policy"
            style={[styles.legalLink, { color: tokens.primaryGreen }]}
          >
            Política de Privacidad
          </Link>
          .
        </Text>

        <Pressable
          style={styles.link}
          onPress={() => {
            setIsSignUp(!isSignUp)
            setError(null)
          }}
        >
          <Text style={[styles.linkText, { color: colors.textMuted }]}>
            {isSignUp ? 'Ya tienes cuenta? Inicia sesion' : 'No tienes cuenta? Registrate'}
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.marketingSection}>
          <View style={styles.featureGrid}>
            <MarketingCard
              icon="◎"
              title="Busca rival"
              body="Tu equipo vs otro equipo. Programa partidos competitivos."
              cardBg={marketingColors.cardBg}
              cardBorder={marketingColors.cardBorder}
              iconBg={marketingColors.iconBg}
              iconColor={marketingColors.icon}
              titleColor={marketingColors.title}
              bodyColor={marketingColors.body}
            />
            <MarketingCard
              icon="◔◔"
              title="Encuentra jugadores"
              body="Te faltan jugadores? Completa tu equipo facilmente."
              cardBg={marketingColors.cardBg}
              cardBorder={marketingColors.cardBorder}
              iconBg={marketingColors.iconBg}
              iconColor={marketingColors.icon}
              titleColor={marketingColors.title}
              bodyColor={marketingColors.body}
            />
            <MarketingCard
              icon="⇄"
              title="Revueltas abiertas"
              body="Unete a partidos abiertos y conoce nuevos jugadores."
              cardBg={marketingColors.cardBg}
              cardBorder={marketingColors.cardBorder}
              iconBg={marketingColors.iconBg}
              iconColor={marketingColors.icon}
              titleColor={marketingColors.title}
              bodyColor={marketingColors.body}
            />
          </View>

          <View
            style={[
              styles.stats,
              {
                backgroundColor: marketingColors.statsBg,
                borderColor: marketingColors.statsBorder,
              },
            ]}
          >
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: marketingColors.statNum }]}>500+</Text>
              <Text style={[styles.statLabel, { color: marketingColors.statLabel }]}>
                Jugadores
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: marketingColors.statNum }]}>120+</Text>
              <Text style={[styles.statLabel, { color: marketingColors.statLabel }]}>
                Partidos / mes
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: marketingColors.statNum }]}>15</Text>
              <Text style={[styles.statLabel, { color: marketingColors.statLabel }]}>
                Canchas
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerBrand, { color: marketingColors.footerBrand }]}>
              SPORTMATCH
            </Text>
            <Text style={[styles.footerNote, { color: marketingColors.footerNote }]}>
              {new Date().getFullYear()} SPORTMATCH. Hecho en Chile.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function MarketingCard({
  icon,
  title,
  body,
  cardBg,
  cardBorder,
  iconBg,
  iconColor,
  titleColor,
  bodyColor,
}: {
  icon: string
  title: string
  body: string
  cardBg: string
  cardBorder: string
  iconBg: string
  iconColor: string
  titleColor: string
  bodyColor: string
}) {
  return (
    <View style={[styles.feature, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <View style={[styles.featureIconWrap, { backgroundColor: iconBg }]}>
        <Text style={[styles.featureIcon, { color: iconColor }]}>{icon}</Text>
      </View>
      <Text style={[styles.featureTitle, { color: titleColor }]}>{title}</Text>
      <Text style={[styles.featureBody, { color: bodyColor }]}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#090B0A',
  },
  wrap: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  topBar: {
    height: 42,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#F5F7F7',
  },
  logoWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 240,
  },
  hint: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: '#F5F7F7',
    marginTop: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#F5F7F7',
    marginTop: 18,
    marginBottom: 6,
    textAlign: 'center',
  },
  hintSignUp: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    color: '#9CA3A3',
    marginBottom: 14,
    textAlign: 'center',
  },
  socialBtn: {
    height: 52,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#2C3131',
    backgroundColor: '#141717',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  socialText: {
    color: '#F5F7F7',
    fontSize: 15,
    fontWeight: '500',
  },
  dividerRow: {
    marginVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2C3131',
  },
  dividerText: {
    color: '#9CA3A3',
    fontSize: 11,
  },
  inputWrap: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    top: 14,
    zIndex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2C3131',
    borderRadius: 12,
    paddingLeft: 42,
    paddingRight: 14,
    paddingVertical: 13,
    fontSize: 17,
    color: '#F5F7F7',
    marginBottom: 12,
    backgroundColor: '#141717',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F5F7F7',
    marginBottom: 6,
  },
  helperText: {
    marginTop: -4,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#9CA3A3',
  },
  primary: {
    backgroundColor: '#0F4539',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#0D0F0E',
    fontSize: 18,
    fontWeight: '700',
  },
  link: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: '#9CA3A3',
    fontSize: 14,
  },
  legalText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  error: {
    marginTop: 12,
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
  },
  marketingSection: {
    marginTop: 26,
    marginHorizontal: -24,
  },
  featureGrid: {
    gap: 12,
    paddingHorizontal: 16,
  },
  feature: {
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 148, 0.24)',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#05090d',
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 69, 57, 0.2)',
  },
  featureIcon: { color: '#0F4539', fontSize: 20, fontWeight: '800' },
  featureTitle: { fontSize: 17, fontWeight: '700', color: '#f3f4f6', marginBottom: 6 },
  featureBody: { fontSize: 14, color: '#9ca3af', lineHeight: 20 },
  stats: {
    flexDirection: 'row',
    marginTop: 18,
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'space-around',
    backgroundColor: '#0a0e12',
  },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 32, fontWeight: '800', color: '#f4c84f' },
  statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  footer: { marginTop: 20, alignItems: 'center', gap: 8, marginBottom: 10 },
  footerBrand: { fontWeight: '700', color: '#e5e7eb', fontSize: 15 },
  footerNote: { fontSize: 12, color: '#9ca3af' },
})
