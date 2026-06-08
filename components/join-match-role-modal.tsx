import { Ionicons } from '@expo/vector-icons'
import { useMemo } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { useScreenTheme } from '../lib/theme-ui'

type Props = {
  visible: boolean
  matchTitle?: string
  fieldLeft: number
  gkLeft: number
  /** Solo arquero disponible (cancha llena). */
  gkOnly?: boolean
  submitting?: boolean
  onClose: () => void
  onSelect: (isGoalkeeper: boolean) => void
}

export function JoinMatchRoleModal({
  visible,
  matchTitle,
  fieldLeft,
  gkLeft,
  gkOnly = false,
  submitting = false,
  onClose,
  onSelect,
}: Props) {
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])

  const showPlayer = !gkOnly && fieldLeft > 0
  const showGk = gkLeft > 0

  const availabilityText = useMemo(() => {
    if (gkOnly) return 'Solo quedan cupos de arquero.'
    if (gkLeft > 0 && fieldLeft > 0) {
      return `${fieldLeft} cupo${fieldLeft === 1 ? '' : 's'} de jugador · ${gkLeft} de arquero`
    }
    if (fieldLeft > 0) return `${fieldLeft} cupo${fieldLeft === 1 ? '' : 's'} de jugador`
    return 'Cupos disponibles'
  }, [gkOnly, fieldLeft, gkLeft])

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.wrap}>
        <Pressable style={styles.fill} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="football-outline" size={22} color={theme.primaryAccent} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {gkOnly ? '¿Te unes como arquero?' : '¿Cómo te unes?'}
              </Text>
              {matchTitle ? (
                <Text style={styles.sub} numberOfLines={2}>
                  {matchTitle}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="people-outline" size={18} color={theme.primaryAccent} />
            <Text style={styles.infoText}>{availabilityText}</Text>
          </View>

          {submitting ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.loadingText}>Uniéndote al partido…</Text>
            </View>
          ) : (
            <>
              <View style={[styles.roleGrid, !showPlayer || !showGk ? styles.roleGridSingle : null]}>
                {showPlayer ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.roleCard,
                      styles.roleCardPlayer,
                      pressed && styles.roleCardPressed,
                    ]}
                    onPress={() => onSelect(false)}
                  >
                    <View style={[styles.roleIconWrap, styles.roleIconPlayer]}>
                      <Ionicons name="shirt-outline" size={28} color={theme.primaryAccent} />
                    </View>
                    <Text style={styles.roleTitle}>Jugador</Text>
                    <Text style={styles.roleDesc}>De campo</Text>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>
                        {fieldLeft} cupo{fieldLeft === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}

                {showGk ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.roleCard,
                      styles.roleCardGk,
                      pressed && styles.roleCardPressed,
                      gkOnly && styles.roleCardGkHighlight,
                    ]}
                    onPress={() => onSelect(true)}
                  >
                    <View style={[styles.roleIconWrap, styles.roleIconGk]}>
                      <Text style={styles.gkEmoji}>🧤</Text>
                    </View>
                    <Text style={styles.roleTitle}>Arquero</Text>
                    <Text style={styles.roleDesc}>Portería</Text>
                    <View style={[styles.roleBadge, styles.roleBadgeGk]}>
                      <Text style={[styles.roleBadgeText, styles.roleBadgeTextGk]}>
                        {gkLeft} cupo{gkLeft === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>

              <Pressable style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'flex-end' },
    fill: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.overlay },
    sheet: {
      backgroundColor: theme.cardElevated,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: theme.modalSheetTopBorder,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 32,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
      marginBottom: 16,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      marginBottom: 16,
    },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.selectedTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1 },
    title: { fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.3 },
    sub: { fontSize: 14, color: theme.textMuted, marginTop: 4, lineHeight: 20 },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.chipBg,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: theme.chipBorder,
    },
    infoText: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.text },
    roleGrid: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    roleGridSingle: {
      justifyContent: 'center',
    },
    roleCard: {
      flex: 1,
      borderRadius: 18,
      paddingVertical: 20,
      paddingHorizontal: 14,
      alignItems: 'center',
      borderWidth: 1.5,
      minHeight: 168,
    },
    roleCardPlayer: {
      backgroundColor: theme.selectedTint,
      borderColor: theme.isDark ? 'rgba(102, 208, 111, 0.35)' : 'rgba(15, 69, 57, 0.2)',
    },
    roleCardGk: {
      backgroundColor: theme.isDark ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 191, 36, 0.12)',
      borderColor: theme.isDark ? 'rgba(251, 191, 36, 0.3)' : 'rgba(217, 119, 6, 0.25)',
    },
    roleCardGkHighlight: {
      flex: undefined,
      width: '100%',
      maxWidth: 280,
      alignSelf: 'center',
    },
    roleCardPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
    roleIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    roleIconPlayer: {
      backgroundColor: theme.isDark ? 'rgba(102, 208, 111, 0.2)' : 'rgba(15, 69, 57, 0.12)',
    },
    roleIconGk: {
      backgroundColor: theme.isDark ? 'rgba(251, 191, 36, 0.18)' : 'rgba(251, 191, 36, 0.25)',
    },
    gkEmoji: { fontSize: 28 },
    roleTitle: { fontSize: 17, fontWeight: '800', color: theme.text },
    roleDesc: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
    roleBadge: {
      marginTop: 12,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 20,
      backgroundColor: theme.isDark ? 'rgba(102, 208, 111, 0.22)' : 'rgba(15, 69, 57, 0.1)',
    },
    roleBadgeGk: {
      backgroundColor: theme.isDark ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.3)',
    },
    roleBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.primaryAccent,
    },
    roleBadgeTextGk: {
      color: theme.isDark ? '#FCD34D' : '#B45309',
    },
    cancelBtn: {
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: 12,
    },
    cancelText: { fontSize: 16, fontWeight: '600', color: theme.textMuted },
    loadingWrap: { alignItems: 'center', paddingVertical: 32, gap: 12 },
    loadingText: { fontSize: 14, color: theme.textMuted, fontWeight: '500' },
  })
}
