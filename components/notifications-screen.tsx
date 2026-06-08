import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { formatRelativePast } from '../lib/format-relative-past'
import { useApp } from '../lib/app-provider'
import { resolveNotificationRoute } from '../lib/notifications/resolve-route'
import type { AppNotification, AppNotificationType } from '../lib/notifications/types'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/supabase/notification-queries'
import { useScreenTheme } from '../lib/theme-ui'
import { BallLoadingIndicator } from './ball-loading-indicator'

function iconForType(type: AppNotificationType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'chat_message':
      return 'chatbubble-ellipses-outline'
    case 'match_invitation':
      return 'mail-unread-outline'
    case 'match_upcoming_2h':
      return 'time-outline'
    case 'match_finished_review_pending':
      return 'star-outline'
    default:
      return 'notifications-outline'
  }
}

function accentForType(
  type: AppNotificationType,
  theme: ReturnType<typeof useScreenTheme>
) {
  switch (type) {
    case 'chat_message':
      return theme.primaryAccent
    case 'match_invitation':
      return theme.accentOnSurface
    case 'match_upcoming_2h':
      return theme.primary
    case 'match_finished_review_pending':
      return theme.success
    default:
      return theme.primaryAccent
  }
}

export function NotificationsScreen() {
  const { currentUser } = useApp()
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])

  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  const unreadCount = useMemo(
    () => items.filter((n) => !n.isRead).length,
    [items]
  )

  const load = useCallback(async () => {
    if (!currentUser || !isSupabaseConfigured()) {
      setItems([])
      setLoading(false)
      return
    }
    const supabase = getSupabase()
    const list = await fetchNotifications(supabase, currentUser.id)
    setItems(list)
    setLoading(false)
  }, [currentUser])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
    }, [load])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const onMarkAllRead = useCallback(async () => {
    if (!isSupabaseConfigured() || unreadCount === 0) return
    setMarkingAll(true)
    try {
      const supabase = getSupabase()
      await markAllNotificationsRead(supabase)
      setItems((prev) =>
        prev.map((n) => ({ ...n, isRead: true }))
      )
    } finally {
      setMarkingAll(false)
    }
  }, [unreadCount])

  const onPressItem = useCallback(async (item: AppNotification) => {
    const target = resolveNotificationRoute(item.type, item.payload)

    if (!item.isRead && isSupabaseConfigured()) {
      const supabase = getSupabase()
      const ok = await markNotificationRead(supabase, item.id)
      if (ok) {
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        )
      }
    }

    if (target) {
      router.push(target as never)
      return
    }

    router.push('/partidos')
  }, [])

  const renderItem = useCallback<ListRenderItem<AppNotification>>(
    ({ item }) => {
      const accent = accentForType(item.type, theme)
      return (
        <Pressable
          onPress={() => void onPressItem(item)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: item.isRead ? theme.card : theme.selectedTint,
              borderColor: theme.border,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: theme.logoBoxBg,
                borderColor: theme.logoBoxBorder,
              },
            ]}
          >
            <Ionicons name={iconForType(item.type)} size={20} color={accent} />
          </View>
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <Text
                style={[
                  styles.rowTitle,
                  { color: theme.text, fontWeight: item.isRead ? '600' : '800' },
                ]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              {!item.isRead ? (
                <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
              ) : null}
            </View>
            {item.body ? (
              <Text style={[styles.rowBodyText, { color: theme.textMuted }]} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
            <Text style={[styles.rowTime, { color: theme.textMuted }]}>
              {formatRelativePast(item.createdAt)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
      )
    },
    [theme, styles, onPressItem]
  )

  if (!currentUser) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <View style={styles.center}>
          <Text style={{ color: theme.textMuted }}>Inicia sesión para ver notificaciones.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={theme.primary} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Notificaciones</Text>
          {unreadCount > 0 ? (
            <Text style={[styles.headerSub, { color: theme.textMuted }]}>
              {unreadCount} sin leer
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => void onMarkAllRead()}
          disabled={unreadCount === 0 || markingAll}
          style={styles.markAllBtn}
        >
          {markingAll ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Text
              style={[
                styles.markAllText,
                {
                  color: unreadCount > 0 ? theme.primary : theme.textMuted,
                  opacity: unreadCount > 0 ? 1 : 0.5,
                },
              ]}
            >
              Leídas
            </Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <BallLoadingIndicator fullScreen size="lg" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.logoBoxBg }]}>
                <Ionicons name="notifications-off-outline" size={32} color={theme.primaryAccent} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                Sin notificaciones
              </Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                Aquí verás invitaciones a partidos, mensajes del chat, recordatorios y partidos
                finalizados.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    safe: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerMid: { flex: 1, paddingHorizontal: 4 },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    headerSub: { fontSize: 12, marginTop: 2, fontWeight: '600' },
    markAllBtn: {
      minWidth: 64,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    markAllText: { fontSize: 14, fontWeight: '700' },
    listContent: { padding: 16, paddingBottom: 32, gap: 10 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    rowTitle: { flex: 1, fontSize: 15, lineHeight: 20 },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 6,
    },
    rowBodyText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
    rowTime: { fontSize: 11, marginTop: 6, fontWeight: '600' },
    emptyCard: {
      marginTop: 32,
      borderWidth: 1,
      borderRadius: 20,
      padding: 28,
      alignItems: 'center',
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: { fontSize: 20, fontWeight: '800', marginTop: 14 },
    emptySub: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 280,
    },
  })
}
