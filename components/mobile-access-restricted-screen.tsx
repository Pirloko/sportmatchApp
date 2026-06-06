import { Ionicons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  MOBILE_WEB_APP_URL,
  mobileAccessDeniedMessage,
} from '../lib/mobile-app-access'
import { useScreenTheme } from '../lib/theme-ui'
import type { AccountType } from '../lib/types'

type MobileAccessRestrictedScreenProps = {
  accountType?: AccountType
  onLogout: () => void
}

export function MobileAccessRestrictedScreen({
  accountType,
  onLogout,
}: MobileAccessRestrictedScreenProps) {
  const theme = useScreenTheme()

  const openWebApp = () => {
    void Linking.openURL(MOBILE_WEB_APP_URL)
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: theme.dangerSurface }]}>
          <Ionicons name="lock-closed-outline" size={36} color={theme.danger} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Acceso restringido</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>
          {mobileAccessDeniedMessage(accountType)}
        </Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>
          Usa la app web de SportMatch para gestionar tu cuenta desde el navegador.
        </Text>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          onPress={openWebApp}
        >
          <Ionicons name="globe-outline" size={18} color={theme.primaryBtnText} />
          <Text style={[styles.primaryBtnText, { color: theme.primaryBtnText }]}>
            Abrir app web
          </Text>
        </Pressable>

        <Text style={[styles.url, { color: theme.link }]} selectable>
          {MOBILE_WEB_APP_URL}
        </Text>

        <Pressable style={styles.logoutBtn} onPress={onLogout}>
          <Text style={[styles.logoutText, { color: theme.textMuted }]}>
            Cerrar sesión
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  url: {
    marginTop: 12,
    fontSize: 13,
    textAlign: 'center',
  },
  logoutBtn: {
    marginTop: 28,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
})
