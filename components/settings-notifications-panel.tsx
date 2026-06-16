import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  Text,
  View,
} from 'react-native'

import { useApp } from '../lib/app-provider'
import {
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
  type NotificationPreferences,
} from '../lib/notifications/categories'
import {
  disablePushForUser,
  enablePushForUser,
  getPushPermissionStatus,
  isPushEnabledLocally,
  openSystemNotificationSettings,
  pushPermissionLabel,
  type PushPermissionStatus,
} from '../lib/push/push-settings'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import {
  fetchNotificationPreferences,
  preferenceKeyForCategory,
  upsertNotificationPreferences,
} from '../lib/supabase/notification-preferences-queries'
import type { ScreenTheme } from '../lib/theme-ui'

type Props = {
  theme: ScreenTheme
  onOpenHistory?: () => void
  /** Recarga estado al abrir el modal de configuración. */
  active?: boolean
}

const CATEGORY_ORDER: NotificationCategory[] = ['matches', 'chat', 'reviews']

function CategoryToggleRow({
  theme,
  title,
  description,
  value,
  disabled,
  busy,
  onChange,
}: {
  theme: ScreenTheme
  title: string
  description: string
  value: boolean
  disabled: boolean
  busy: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: theme.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 3, lineHeight: 17 }}>
          {description}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={theme.primary} size="small" />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{
            false: theme.border,
            true: theme.isDark ? 'rgba(102,208,111,0.45)' : 'rgba(15,69,57,0.35)',
          }}
          thumbColor={value ? theme.primary : theme.textMuted}
        />
      )}
    </View>
  )
}

export function SettingsNotificationsPanel({ theme, onOpenHistory, active }: Props) {
  const { currentUser } = useApp()
  const [pushEnabled, setPushEnabled] = useState(true)
  const [permission, setPermission] = useState<PushPermissionStatus>('undetermined')
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [masterBusy, setMasterBusy] = useState(false)
  const [categoryBusy, setCategoryBusy] = useState<NotificationCategory | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const [localEnabled, perm] = await Promise.all([
      isPushEnabledLocally(),
      getPushPermissionStatus(),
    ])
    setPushEnabled(localEnabled)
    setPermission(perm)

    if (currentUser && isSupabaseConfigured()) {
      try {
        const supabase = getSupabase()
        const nextPrefs = await fetchNotificationPreferences(supabase, currentUser.id)
        setPrefs(nextPrefs)
      } catch {
        setPrefs(null)
      }
    }

    setLoaded(true)
  }, [currentUser])

  useEffect(() => {
    if (active !== false) void refresh()
  }, [active, refresh])

  const pushActive = pushEnabled && permission === 'granted'
  const categoriesDisabled = !pushActive || !currentUser || !isSupabaseConfigured()

  const onTogglePush = async (next: boolean) => {
    if (!currentUser || !isSupabaseConfigured()) {
      Alert.alert('Sin conexión', 'Inicia sesión para gestionar las notificaciones push.')
      return
    }
    setMasterBusy(true)
    try {
      const supabase = getSupabase()
      if (next) {
        const res = await enablePushForUser(supabase, currentUser.id)
        if (!res.ok) {
          Alert.alert('No se pudo activar', res.error)
          await refresh()
          return
        }
      } else {
        await disablePushForUser(supabase, currentUser.id)
      }
      await refresh()
    } finally {
      setMasterBusy(false)
    }
  }

  const onToggleCategory = async (category: NotificationCategory, next: boolean) => {
    if (!currentUser || !isSupabaseConfigured() || !prefs) return
    const key = preferenceKeyForCategory(category)
    const prev = prefs[key]
    setPrefs({ ...prefs, [key]: next })
    setCategoryBusy(category)
    try {
      const supabase = getSupabase()
      const updated = await upsertNotificationPreferences(supabase, currentUser.id, {
        [key]: next,
      })
      setPrefs(updated)
    } catch (err) {
      setPrefs({ ...prefs, [key]: prev })
      const msg = err instanceof Error ? err.message : 'No se pudo guardar.'
      Alert.alert('Error', msg)
    } finally {
      setCategoryBusy(null)
    }
  }

  const openHistory = () => {
    onOpenHistory?.()
    router.push('/notificaciones')
  }

  return (
    <View>
      <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 6, lineHeight: 20 }}>
        Recibe avisos de partidos, invitaciones y mensajes en tu dispositivo.
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
            Notificaciones push
          </Text>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
            {pushPermissionLabel(permission)}
          </Text>
        </View>
        {!loaded || masterBusy ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : (
          <Switch
            value={pushActive}
            onValueChange={(v) => void onTogglePush(v)}
            disabled={permission === 'unavailable'}
            trackColor={{
              false: theme.border,
              true: theme.isDark ? 'rgba(102,208,111,0.45)' : 'rgba(15,69,57,0.35)',
            }}
            thumbColor={pushActive ? theme.primary : theme.textMuted}
          />
        )}
      </View>

      {permission === 'denied' ? (
        <Pressable
          onPress={openSystemNotificationSettings}
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="settings-outline" size={16} color={theme.primary} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary }}>
            Abrir ajustes del sistema
          </Text>
        </Pressable>
      ) : null}

      <Text
        style={{
          fontSize: 12,
          fontWeight: '800',
          color: theme.textMuted,
          marginTop: 16,
          letterSpacing: 0.6,
        }}
      >
        POR CATEGORÍA
      </Text>
      {!loaded || !prefs ? (
        <ActivityIndicator color={theme.primary} size="small" style={{ marginTop: 12 }} />
      ) : (
        CATEGORY_ORDER.map((category) => {
          const meta = NOTIFICATION_CATEGORY_LABELS[category]
          const key = preferenceKeyForCategory(category)
          return (
            <CategoryToggleRow
              key={category}
              theme={theme}
              title={meta.title}
              description={meta.description}
              value={prefs[key]}
              disabled={categoriesDisabled}
              busy={categoryBusy === category}
              onChange={(v) => void onToggleCategory(category, v)}
            />
          )
        })
      )}

      {categoriesDisabled && loaded ? (
        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 8, lineHeight: 16 }}>
          Activa las notificaciones push para personalizar cada categoría.
        </Text>
      ) : null}

      <Pressable
        onPress={openHistory}
        style={{
          marginTop: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: theme.chipBg,
          borderWidth: 1,
          borderColor: theme.chipBorder,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="notifications-outline" size={18} color={theme.primaryAccent} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
            Ver historial
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
      </Pressable>

      <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 10, lineHeight: 16 }}>
        Las notificaciones in-app siguen apareciendo en el historial aunque desactives el push
        de una categoría.
      </Text>
    </View>
  )
}
