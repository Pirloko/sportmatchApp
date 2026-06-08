import { Ionicons } from '@expo/vector-icons'
import { useMemo } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { useScreenTheme } from '../lib/theme-ui'

type Props = {
  visible: boolean
  matchTitle?: string
  joinedAsGoalkeeper?: boolean
  onClose: () => void
}

export function MatchJoinSuccessModal({
  visible,
  matchTitle,
  joinedAsGoalkeeper,
  onClose,
}: Props) {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])

  const roleHint = joinedAsGoalkeeper
    ? 'Te anotaste como arquero en este partido.'
    : 'Te anotaste como jugador en este partido.'

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Pressable style={styles.fill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.iconRing}>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark" size={36} color={theme.primaryBtnText} />
            </View>
          </View>

          <Text style={styles.title}>¡Te uniste al partido!</Text>

          {matchTitle ? (
            <Text style={styles.matchTitle} numberOfLines={2}>
              {matchTitle}
            </Text>
          ) : null}

          <Text style={styles.message}>
            Ya estás en la lista de participantes. {roleHint}
          </Text>

          <Pressable style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Genial</Text>
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
      borderColor: theme.modalSheetTopBorder,
      alignItems: 'center',
    },
    iconRing: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: theme.selectedTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.primary,
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
      color: theme.primaryAccent,
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
      backgroundColor: theme.primary,
      alignItems: 'center',
    },
    btnText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.primaryBtnText,
    },
  })
}
