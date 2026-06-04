import { Link } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  LEGAL_LAST_UPDATED,
  legalDocumentSections,
  legalDocumentTitle,
  type LegalDocumentKind,
} from '../lib/legal-content'
import { useScreenTheme } from '../lib/theme-ui'

export function LegalDocumentScreen({ kind }: { kind: LegalDocumentKind }) {
  const theme = useScreenTheme()
  const sections = legalDocumentSections(kind)

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.updated, { color: theme.textMuted }]}>
          Última actualización: {LEGAL_LAST_UPDATED}
        </Text>
        <Text style={[styles.scopeHint, { color: theme.textMuted }]}>
          Aplica a la app web SportMatch (sportmatch.cl) y a la app móvil SportMatch (Android
          e iOS).
        </Text>
        {sections.map((section) => (
          <View key={section.title} style={styles.block}>
            <Text style={[styles.heading, { color: theme.text }]}>{section.title}</Text>
            {section.title === '13. Privacidad' && kind === 'terms' ? (
              <Text style={[styles.body, { color: theme.textMuted }]}>
                El tratamiento de datos personales está en nuestra{' '}
                <Link href="/privacy-policy" style={{ color: theme.primary }}>
                  Política de Privacidad
                </Link>
                .
              </Text>
            ) : section.title === '1. Aceptación de los Términos' && kind === 'terms' ? (
              <Text style={[styles.body, { color: theme.textMuted }]}>
                Al registrarte o usar la app web SportMatch, la app móvil SportMatch o
                cualquier función del servicio, aceptas estos Términos y nuestra{' '}
                <Link href="/privacy-policy" style={{ color: theme.primary }}>
                  Política de Privacidad
                </Link>
                . Si no estás de acuerdo, no uses SportMatch en ninguna versión.
                {'\n\n'}
                Debes cumplir la edad mínima del registro y tener capacidad legal según la
                legislación chilena.
              </Text>
            ) : (
              <Text style={[styles.body, { color: theme.textMuted }]}>{section.body}</Text>
            )}
          </View>
        ))}
        {kind === 'privacy' ? (
          <View style={styles.footerLinks}>
            <Link href="/terms" asChild>
              <Pressable>
                <Text style={[styles.footerLink, { color: theme.primary }]}>
                  Ver Términos de Uso
                </Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <View style={styles.footerLinks}>
            <Link href="/privacy-policy" asChild>
              <Pressable>
                <Text style={[styles.footerLink, { color: theme.primary }]}>
                  Ver Política de Privacidad
                </Text>
              </Pressable>
            </Link>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

export function legalScreenOptions(kind: LegalDocumentKind) {
  return { title: legalDocumentTitle(kind) }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  updated: { fontSize: 13, marginBottom: 8 },
  scopeHint: { fontSize: 13, lineHeight: 20, marginBottom: 20 },
  block: { marginBottom: 20 },
  heading: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22 },
  footerLinks: { marginTop: 8, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  footerLink: { fontSize: 15, fontWeight: '600' },
})
