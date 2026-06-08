import { Ionicons } from '@expo/vector-icons'
import { useMemo } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { useScreenTheme } from '../lib/theme-ui'

type Props = {
  visible: boolean
  matchTitle?: string
  /** Mensaje principal bajo el título. */
  message?: string
  onClose: () => void
}

export function MatchLeaveSuccessModal({
  visible,
  matchTitle,
  message = 'Liberaste tu cupo para que otro jugador pueda sumarse. ¡Gracias por avisar!',
  onClose,
}: Props) {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Pressable style={styles.fill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.iconRing}>
            <View style={styles.iconCircle}>
              <Ionicons name="exit-outline" size={32} color={theme.dangerOnSurface} />
            </View>
          </View>

          <Text style={styles.title}>Saliste del partido</Text>

          {matchTitle ? (
            <Text style={styles.matchTitle} numberOfLines={2}>
              {matchTitle}
            </Text>
          ) : null}

          <Text style={styles.message}>{message}</Text>

          <Pressable style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Entendido</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
    },
    fill: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      borderRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: 24,
      backgroundColor: theme.cardElevated,
      borderWidth: 1,
      borderColor: theme.isDark
        ? 'rgba(248, 113, 113, 0.28)'
        : 'rgba(239, 68, 68, 0.18)',
      alignItems: 'center',
    },
    iconRing: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: theme.dangerSurface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.isDark
        ? 'rgba(248, 113, 113, 0.22)'
        : 'rgba(239, 68, 68, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    matchTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: 8,
    },
    message: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: 12,
      marginBottom: 22,
    },
    btn: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: theme.danger,
      alignItems: 'center',
    },
    btnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  })
}
