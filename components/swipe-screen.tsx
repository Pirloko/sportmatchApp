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
import { useThemePreference } from '../lib/theme-context'
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

function levelBadgeStyle(level: string) {
  switch (level) {
    case 'principiante':
      return styles.badgeBlue
    case 'intermedio':
      return styles.badgePrimary
    case 'avanzado':
      return styles.badgeTeal
    case 'competitivo':
      return styles.badgeRed
    default:
      return styles.badgeNeutral
  }
}

export function SwipeScreen() {
  const { currentUser, getFilteredUsers } = useApp()
  const { tokens } = useThemePreference()
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
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
        <Text style={styles.gate}>Swipe solo para jugadores.</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
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
                <PlayerCard user={users[currentIndex + 1]} />
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
                <PlayerCard user={currentProfile} />
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

function PlayerCard({ user }: { user: User }) {
  return (
    <View style={styles.card}>
      <View style={styles.photoWrap}>
        <Image source={{ uri: user.photo }} style={styles.photo} />
        <View style={styles.overlay}>
          <View style={styles.rowTop}>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>
                {user.name}, {user.age}
              </Text>
              <Text style={styles.city}>📍 {user.city}</Text>
            </View>
            <View style={[styles.badge, levelBadgeStyle(user.level)]}>
              <Text style={styles.badgeText}>{levelLabel(user.level)}</Text>
            </View>
          </View>
          <View style={styles.badgesRow}>
            <View style={styles.miniBadge}>
              <Text style={styles.miniBadgeText}>
                {positionLabel(user.position)}
              </Text>
            </View>
            <View style={styles.miniBadge}>
              <Text style={styles.miniBadgeText}>
                📅 {user.availability.length} días
              </Text>
            </View>
          </View>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  gate: { padding: 24, textAlign: 'center', color: '#6b7280' },
  backLink: { alignSelf: 'center', marginTop: 16 },
  backLinkText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 22, color: '#374151' },
  headerText: { flex: 1, marginLeft: 4 },
  title: { fontSize: 17, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  undoBtn: { padding: 8 },
  undoIcon: { fontSize: 22, color: '#2563eb' },
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
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  photoWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#e5e7eb',
  },
  photo: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
  },
  nameBlock: { flex: 1 },
  name: { fontSize: 24, fontWeight: '800', color: '#fff' },
  city: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  miniBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  miniBadgeText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  bio: { marginTop: 10, fontSize: 14, color: 'rgba(255,255,255,0.92)' },
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
    backgroundColor: 'rgba(37, 99, 235, 0.95)',
    borderColor: '#fff',
    transform: [{ rotate: '-12deg' }],
  },
  stampNope: {
    right: 16,
    backgroundColor: 'rgba(220, 38, 38, 0.95)',
    borderColor: '#fff',
    transform: [{ rotate: '12deg' }],
  },
  stampText: { fontSize: 22, fontWeight: '900', color: '#fff' },
  stampTextNope: { fontSize: 22, fontWeight: '900', color: '#fff' },
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
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(220, 38, 38, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnNopeIcon: { fontSize: 28, color: '#dc2626', fontWeight: '700' },
  btnLike: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(37, 99, 235, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLikeIcon: { fontSize: 28, color: '#2563eb' },
  empty: { alignItems: 'center', padding: 24 },
  emptyIcon: { fontSize: 48, color: '#d1d5db', marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  emptySub: { fontSize: 15, color: '#6b7280', marginTop: 8, textAlign: 'center' },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
