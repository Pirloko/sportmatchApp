import { router } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { levelLabel } from '../lib/format-match'
import { useApp } from '../lib/app-provider'
import { useScreenTheme } from '../lib/theme-ui'
import type { User } from '../lib/types'

const SCREEN_W = Dimensions.get('window').width
const CARD_MAX = Math.min(SCREEN_W - 32, 400)

function positionLabel(p: string): string {
  switch (p) {
    case 'portero':
      return 'Portero'
    case 'defensa':
      return 'Defensa'
    case 'mediocampista':
      return 'Mediocampista'
    case 'delantero':
      return 'Delantero'
    default:
      return p
  }
}

export function SwipeScreen() {
  const theme = useScreenTheme()
  const styles = useMemo(() => createSwipeStyles(theme), [theme])
  const { currentUser, getFilteredUsers } = useApp()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [swipedUsers, setSwipedUsers] = useState<{ id: string; liked: boolean }[]>(
    []
  )
  const [dragOffset, setDragOffset] = useState(0)

  const users = currentUser ? getFilteredUsers(currentUser.gender) : []
  const currentProfile = users[currentIndex]
  const isFinished = currentIndex >= users.length

  const handleSwipe = useCallback(
    (liked: boolean) => {
      if (!currentProfile) return
      setSwipedUsers((prev) => [...prev, { id: currentProfile.id, liked }])
      setDragOffset(liked ? 500 : -500)
      setTimeout(() => {
        setCurrentIndex((i) => i + 1)
        setDragOffset(0)
      }, 280)
    },
    [currentProfile]
  )

  const handleUndo = useCallback(() => {
    if (swipedUsers.length === 0) return
    setSwipedUsers((prev) => prev.slice(0, -1))
    setCurrentIndex((i) => Math.max(0, i - 1))
  }, [swipedUsers.length])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => {
          setDragOffset(g.dx)
        },
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) > 100) {
            handleSwipe(g.dx > 0)
          } else {
            setDragOffset(0)
          }
        },
      }),
    [handleSwipe]
  )

  if (!currentUser || currentUser.accountType !== 'player') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <Text style={styles.gate}>Swipe solo para jugadores.</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Descubre jugadores</Text>
          <Text style={styles.subtitle}>Desliza para conectar</Text>
        </View>
        {swipedUsers.length > 0 ? (
          <Pressable onPress={handleUndo} hitSlop={12} style={styles.undoBtn}>
            <Text style={styles.undoIcon}>↺</Text>
          </Pressable>
        ) : (
          <View style={styles.undoPlaceholder} />
        )}
      </View>

      <View style={styles.centerArea}>
        {isFinished ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>♥</Text>
            <Text style={styles.emptyTitle}>No hay más jugadores</Text>
            <Text style={styles.emptySub}>
              Vuelve más tarde para ver nuevos perfiles
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                setCurrentIndex(0)
                setSwipedUsers([])
              }}
            >
              <Text style={styles.primaryBtnText}>Empezar de nuevo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.stack, { width: CARD_MAX }]}>
            {users[currentIndex + 1] ? (
              <View style={styles.cardBehind} pointerEvents="none">
                <PlayerCard user={users[currentIndex + 1]} styles={styles} />
              </View>
            ) : null}
            {currentProfile ? (
              <View
                style={[
                  styles.cardFront,
                  {
                    transform: [
                      { translateX: dragOffset },
                      { rotate: `${dragOffset * 0.05}deg` },
                    ],
                  },
                ]}
                {...panResponder.panHandlers}
              >
                <PlayerCard user={currentProfile} styles={styles} />
                {dragOffset > 50 ? (
                  <View style={[styles.stamp, styles.stampLike]}>
                    <Text style={styles.stampText}>LIKE</Text>
                  </View>
                ) : null}
                {dragOffset < -50 ? (
                  <View style={[styles.stamp, styles.stampNope]}>
                    <Text style={styles.stampTextNope}>NOPE</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </View>

      {!isFinished && currentProfile ? (
        <View style={styles.actions}>
          <Pressable
            style={styles.btnNope}
            onPress={() => handleSwipe(false)}
            accessibilityLabel="Pasar"
          >
            <Text style={styles.btnNopeIcon}>✕</Text>
          </Pressable>
          <Pressable
            style={styles.btnLike}
            onPress={() => handleSwipe(true)}
            accessibilityLabel="Me gusta"
          >
            <Text style={styles.btnLikeIcon}>♥</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

function PlayerCard({
  user,
  styles: s,
}: {
  user: User
  styles: ReturnType<typeof createSwipeStyles>
}) {
  return (
    <View style={s.card}>
      <View style={s.photoWrap}>
        <Image source={{ uri: user.photo }} style={s.photo} />
        <View style={s.overlay}>
          <View style={s.rowTop}>
            <View style={s.nameBlock}>
              <Text style={s.name}>
                {user.name}, {user.age}
              </Text>
              <Text style={s.city}>📍 {user.city}</Text>
            </View>
            <View style={[s.badge, levelBadgeStyle(user.level, s)]}>
              <Text style={s.badgeText}>{levelLabel(user.level)}</Text>
            </View>
          </View>
          <View style={s.badgesRow}>
            <View style={s.miniBadge}>
              <Text style={s.miniBadgeText}>
                {positionLabel(user.position)}
              </Text>
            </View>
            <View style={s.miniBadge}>
              <Text style={s.miniBadgeText}>
                📅 {user.availability.length} días
              </Text>
            </View>
          </View>
          {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        </View>
      </View>
    </View>
  )
}

function levelBadgeStyle(level: string, s: ReturnType<typeof createSwipeStyles>) {
  switch (level) {
    case 'principiante':
      return s.badgeBlue
    case 'intermedio':
      return s.badgePrimary
    case 'avanzado':
      return s.badgeTeal
    case 'competitivo':
      return s.badgeRed
    default:
      return s.badgeNeutral
  }
}

function createSwipeStyles(theme: ReturnType<typeof useScreenTheme>) {
  const { tokens, isDark } = theme
  const onPhoto = theme.primaryBtnText
  const photoScrim = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)'
  const chipOnPhoto = 'rgba(255,255,255,0.2)'
  const chipBorderOnPhoto = 'rgba(255,255,255,0.35)'
  return StyleSheet.create({
    safe: { flex: 1 },
    gate: { padding: 24, textAlign: 'center', color: theme.textMuted },
    backLink: { alignSelf: 'center', marginTop: 16 },
    backLinkText: { color: theme.primary, fontSize: 16, fontWeight: '600' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    backBtn: { padding: 8 },
    backIcon: { fontSize: 22, color: theme.text },
    headerText: { flex: 1, marginLeft: 4 },
    title: { fontSize: 17, fontWeight: '700', color: theme.text },
    subtitle: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
    undoBtn: { padding: 8 },
    undoIcon: { fontSize: 22, color: theme.primary },
    undoPlaceholder: { width: 38 },
    centerArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    stack: {
      minHeight: 420,
      justifyContent: 'center',
    },
    cardBehind: {
      position: 'absolute',
      alignSelf: 'center',
      width: '100%',
      transform: [{ scale: 0.95 }],
      opacity: 0.5,
    },
    cardFront: {
      width: '100%',
      zIndex: 2,
    },
    card: {
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      shadowColor: '#000',
      shadowOpacity: theme.isDark ? 0.35 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    photoWrap: {
      width: '100%',
      aspectRatio: 3 / 4,
      backgroundColor: theme.border,
    },
    photo: { width: '100%', height: '100%' },
    overlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: 20,
      paddingBottom: 24,
      backgroundColor: photoScrim,
    },
    rowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 8,
    },
    nameBlock: { flex: 1 },
    name: { fontSize: 24, fontWeight: '800', color: onPhoto },
    city: { fontSize: 14, color: chipBorderOnPhoto, marginTop: 4 },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
    },
    badgeBlue: {
      backgroundColor: 'rgba(59, 130, 246, 0.35)',
      borderColor: 'rgba(59, 130, 246, 0.6)',
    },
    badgePrimary: {
      backgroundColor: 'rgba(37, 99, 235, 0.35)',
      borderColor: 'rgba(37, 99, 235, 0.6)',
    },
    badgeTeal: {
      backgroundColor: 'rgba(8, 145, 178, 0.35)',
      borderColor: 'rgba(8, 145, 178, 0.6)',
    },
    badgeRed: {
      backgroundColor: 'rgba(220, 38, 38, 0.35)',
      borderColor: 'rgba(220, 38, 38, 0.6)',
    },
    badgeNeutral: {
      backgroundColor: chipOnPhoto,
      borderColor: chipBorderOnPhoto,
    },
    badgeText: { fontSize: 12, fontWeight: '700', color: onPhoto },
    badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    miniBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: chipOnPhoto,
      borderWidth: 1,
      borderColor: chipBorderOnPhoto,
    },
    miniBadgeText: { fontSize: 12, color: onPhoto, fontWeight: '600' },
    bio: { marginTop: 10, fontSize: 14, color: onPhoto },
    stamp: {
      position: 'absolute',
      top: 24,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 3,
    },
    stampLike: {
      left: 16,
      backgroundColor: theme.primary,
      borderColor: onPhoto,
      transform: [{ rotate: '-12deg' }],
    },
    stampNope: {
      right: 16,
      backgroundColor: theme.danger,
      borderColor: onPhoto,
      transform: [{ rotate: '12deg' }],
    },
    stampText: { fontSize: 22, fontWeight: '900', color: onPhoto },
    stampTextNope: { fontSize: 22, fontWeight: '900', color: onPhoto },
    actions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 40,
      paddingVertical: 20,
      paddingBottom: 28,
    },
    btnNope: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(220, 38, 38, 0.12)',
      borderWidth: 2,
      borderColor: isDark ? 'rgba(239, 68, 68, 0.5)' : 'rgba(220, 38, 38, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnNopeIcon: { fontSize: 28, color: tokens.destructive, fontWeight: '700' },
    btnLike: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.selectedTint,
      borderWidth: 2,
      borderColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnLikeIcon: { fontSize: 28, color: theme.primary },
    empty: { alignItems: 'center', padding: 24 },
    emptyIcon: { fontSize: 48, color: theme.border, marginBottom: 12 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
    emptySub: {
      fontSize: 15,
      color: theme.textMuted,
      marginTop: 8,
      textAlign: 'center',
    },
    primaryBtn: {
      marginTop: 20,
      backgroundColor: theme.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    primaryBtnText: {
      color: theme.primaryBtnText,
      fontSize: 16,
      fontWeight: '700',
    },
  })
}
