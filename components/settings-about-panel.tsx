import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native'

import { APP_LOGO } from '../lib/app-brand-assets'
import { MOBILE_WEB_APP_URL } from '../lib/mobile-app-access'
import type { ScreenTheme } from '../lib/theme-ui'

const SUPPORT_EMAIL = 'ancodevs.cl@gmail.com'

type Props = {
  theme: ScreenTheme
}

function AboutLinkRow({
  theme,
  icon,
  label,
  value,
  onPress,
}: {
  theme: ScreenTheme
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: theme.border,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.chipBg,
          borderWidth: 1,
          borderColor: theme.chipBorder,
        }}
      >
        <Ionicons name={icon} size={17} color={theme.primaryAccent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, color: theme.textMuted, fontWeight: '600' }}>
          {label}
        </Text>
        <Text
          style={{ fontSize: 14, color: theme.text, fontWeight: '700', marginTop: 2 }}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={theme.textMuted} />
    </Pressable>
  )
}

export function SettingsAboutPanel({ theme }: Props) {
  const appVersion = Constants.expoConfig?.version ?? '1.0.0'
  const buildLabel =
    Platform.OS === 'ios'
      ? `Build ${Constants.expoConfig?.ios?.buildNumber ?? '—'}`
      : Platform.OS === 'android'
        ? `Build ${Constants.expoConfig?.android?.versionCode ?? '—'}`
        : 'Web'

  const openUrl = (url: string) => {
    void Linking.openURL(url)
  }

  return (
    <View>
      <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 4 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            overflow: 'hidden',
            backgroundColor: theme.chipBg,
            borderWidth: 1,
            borderColor: theme.chipBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image source={APP_LOGO} style={{ width: 56, height: 56 }} resizeMode="contain" />
        </View>
        <Text
          style={{
            fontSize: 18,
            fontWeight: '900',
            color: theme.text,
            marginTop: 12,
            letterSpacing: 0.6,
          }}
        >
          SportMatch
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: theme.textMuted,
            marginTop: 6,
            textAlign: 'center',
            lineHeight: 20,
            paddingHorizontal: 8,
          }}
        >
          Encuentra rivales, jugadores y revueltas en tu ciudad.
        </Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>
          Versión {appVersion} · {buildLabel}
        </Text>
      </View>

      <AboutLinkRow
        theme={theme}
        icon="globe-outline"
        label="Sitio web"
        value="sportmatch.cl"
        onPress={() => openUrl(MOBILE_WEB_APP_URL)}
      />
      <AboutLinkRow
        theme={theme}
        icon="mail-outline"
        label="Contacto"
        value={SUPPORT_EMAIL}
        onPress={() => openUrl(`mailto:${SUPPORT_EMAIL}`)}
      />
      <AboutLinkRow
        theme={theme}
        icon="football-outline"
        label="Plataforma"
        value={
          Platform.OS === 'ios'
            ? 'App iOS para jugadores'
            : Platform.OS === 'android'
              ? 'App Android para jugadores'
              : 'SportMatch'
        }
        onPress={() => openUrl(MOBILE_WEB_APP_URL)}
      />

      <Text
        style={{
          fontSize: 11,
          color: theme.textMuted,
          marginTop: 12,
          lineHeight: 16,
          textAlign: 'center',
        }}
      >
        Hecho en Chile para organizar partidos, equipos y comunidad futbolera.
      </Text>
    </View>
  )
}
