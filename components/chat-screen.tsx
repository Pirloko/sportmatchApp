import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlashList,
  type FlashListRef,
  type ListRenderItemInfo,
} from '@shopify/flash-list'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  getThreadSnapshot,
  setThreadSnapshot,
} from '../lib/chat/thread-session-cache'
import {
  formatMatchClock,
  formatMatchDateTime,
  formatMatchWeekdayDate,
  formatRelativeUntil,
} from '../lib/format-match'
import { useApp } from '../lib/app-provider'
import { DEFAULT_AVATAR } from '../lib/supabase/mappers'
import { useThemePreference } from '../lib/theme-context'
import {
  ProductEventNames,
  trackProductEvent,
} from '../lib/telemetry/product-analytics'
import { createClient, isSupabaseConfigured } from '../lib/supabase/client'
import {
  CHAT_MESSAGES_PAGE_SIZE,
  fetchChatMessagesPage,
  fetchParticipantsForOpportunity,
  hydrateChatMessageFromInsert,
  type ChatMessageRow,
  type OpportunityParticipantRow,
} from '../lib/supabase/message-queries'
import {
  fetchMyRatingForOpportunity,
  getRatingDeadline,
  isMatchChatMessagingOpen,
  type MatchOpportunityRatingRow,
} from '../lib/supabase/rating-queries'
import { MatchCompletionPanel } from './match-completion-panel'

type UiMessage = ChatMessageRow & { isMe: boolean; pending?: boolean }

function mergeMessageSorted(prev: UiMessage[], add: UiMessage): UiMessage[] {
  if (prev.some((m) => m.id === add.id)) return prev
  return [...prev, add].sort((a, b) => {
    const t = a.createdAt.getTime() - b.createdAt.getTime()
    if (t !== 0) return t
    return a.id.localeCompare(b.id)
  })
}

function mergeOlderFirst(prev: UiMessage[], older: UiMessage[]): UiMessage[] {
  const byId = new Map<string, UiMessage>()
  for (const m of older) byId.set(m.id, m)
  for (const m of prev) byId.set(m.id, m)
  return Array.from(byId.values()).sort((a, b) => {
    const t = a.createdAt.getTime() - b.createdAt.getTime()
    if (t !== 0) return t
    return a.id.localeCompare(b.id)
  })
}

function toCachedRows(msgs: UiMessage[]): ChatMessageRow[] {
  return msgs
    .filter((m) => !m.pending)
    .map(
      ({
        id,
        senderId,
        content,
        createdAt,
        senderName,
        senderPhoto,
      }) => ({
        id,
        senderId,
        content,
        createdAt,
        senderName,
        senderPhoto,
      })
    )
}

function participantStatusLabel(s: string): string {
  switch (s) {
    case 'creator':
      return 'Organizador'
    case 'confirmed':
      return 'Confirmado'
    case 'pending':
      return 'Pendiente'
    case 'invited':
      return 'Invitado'
    case 'cancelled':
      return 'Cancelado'
    default:
      return s
  }
}

export function ChatScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const opportunityId = Array.isArray(params.id) ? params.id[0] : params.id

  const {
    currentUser,
    matchOpportunities,
    participatingOpportunityIds,
    refreshMatchData,
    finalizeMatchOpportunity,
    suspendMatchOpportunity,
    submitMatchRating,
  } = useApp()
  const { tokens } = useThemePreference()

  const [messages, setMessages] = useState<UiMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [participants, setParticipants] = useState<OpportunityParticipantRow[]>(
    []
  )
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [myRating, setMyRating] = useState<MatchOpportunityRatingRow | null>(
    null
  )
  const [loadingRating, setLoadingRating] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const listRef = useRef<FlashListRef<UiMessage>>(null)
  const messagesRef = useRef<UiMessage[]>([])
  const hasMoreOlderRef = useRef(false)
  const loadingOlderRef = useRef(false)
  const prevLastMessageIdRef = useRef<string | null>(null)

  const opportunity = useMemo(
    () =>
      opportunityId
        ? matchOpportunities.find((m) => m.id === opportunityId)
        : undefined,
    [matchOpportunities, opportunityId]
  )

  messagesRef.current = messages
  hasMoreOlderRef.current = hasMoreOlder

  const canAccess = useMemo(() => {
    if (!currentUser || !opportunityId || !opportunity) return false
    return (
      opportunity.creatorId === currentUser.id ||
      participatingOpportunityIds.includes(opportunityId)
    )
  }, [currentUser, opportunity, opportunityId, participatingOpportunityIds])

  const chatOpen = opportunity
    ? isMatchChatMessagingOpen(opportunity)
    : false

  const loadMyRating = useCallback(async () => {
    if (!opportunityId || !currentUser || !isSupabaseConfigured()) {
      setMyRating(null)
      return
    }
    setLoadingRating(true)
    try {
      const row = await fetchMyRatingForOpportunity(
        createClient(),
        opportunityId,
        currentUser.id
      )
      setMyRating(row)
    } finally {
      setLoadingRating(false)
    }
  }, [opportunityId, currentUser])

  const loadParticipants = useCallback(async () => {
    if (!opportunityId || !currentUser || !isSupabaseConfigured()) {
      setParticipants([])
      return
    }
    setLoadingParticipants(true)
    try {
      const supabase = createClient()
      const rows = await fetchParticipantsForOpportunity(
        supabase,
        opportunityId
      )
      setParticipants(rows)
    } finally {
      setLoadingParticipants(false)
    }
  }, [opportunityId, currentUser])

  const loadMessages = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opportunityId || !currentUser || !isSupabaseConfigured()) {
        setMessages([])
        setHasMoreOlder(false)
        if (!opts?.silent) setLoading(false)
        return
      }
      if (!opts?.silent) {
        const snap = getThreadSnapshot(opportunityId)
        if (snap?.messages.length) {
          setMessages(
            snap.messages.map((m) => ({
              ...m,
              isMe: m.senderId === currentUser.id,
            }))
          )
          setHasMoreOlder(snap.hasMoreOlder)
        }
        setLoading(true)
      }
      try {
        const supabase = createClient()
        const { rows, hasMore } = await fetchChatMessagesPage(
          supabase,
          opportunityId,
          null,
          CHAT_MESSAGES_PAGE_SIZE
        )
        const ui = rows.map((m) => ({
          ...m,
          isMe: m.senderId === currentUser.id,
        }))
        setMessages(ui)
        setHasMoreOlder(hasMore)
        setThreadSnapshot(opportunityId, {
          messages: rows,
          hasMoreOlder: hasMore,
        })
      } catch {
        if (!opts?.silent) {
          Alert.alert('Error', 'No se pudieron cargar los mensajes')
        }
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [opportunityId, currentUser]
  )

  const loadOlderMessages = useCallback(async () => {
    if (!opportunityId || !currentUser || !isSupabaseConfigured()) return
    if (!hasMoreOlderRef.current || loadingOlderRef.current) return
    const prev = messagesRef.current
    if (!prev.length) return
    const oldest = prev[0]
    if (oldest.pending) return

    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const before = {
        createdAtIso: oldest.createdAt.toISOString(),
        id: oldest.id,
      }
      const supabase = createClient()
      const { rows, hasMore } = await fetchChatMessagesPage(
        supabase,
        opportunityId,
        before,
        CHAT_MESSAGES_PAGE_SIZE
      )
      if (!rows.length) {
        setHasMoreOlder(false)
        return
      }
      const olderUi = rows.map((m) => ({
        ...m,
        isMe: m.senderId === currentUser.id,
      }))
      setMessages((p) => {
        const next = mergeOlderFirst(p, olderUi)
        queueMicrotask(() => {
          setThreadSnapshot(opportunityId, {
            hasMoreOlder: hasMore,
            messages: toCachedRows(next),
          })
        })
        return next
      })
      setHasMoreOlder(hasMore)
    } catch {
      Alert.alert('Error', 'No se pudieron cargar mensajes anteriores')
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [opportunityId, currentUser])

  useEffect(() => {
    if (!opportunity && opportunityId && currentUser) {
      void refreshMatchData()
    }
  }, [opportunity, opportunityId, currentUser, refreshMatchData])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (showInfo) void loadParticipants()
  }, [showInfo, loadParticipants])

  useEffect(() => {
    void loadMyRating()
  }, [loadMyRating])

  useEffect(() => {
    if (!opportunityId || !isSupabaseConfigured() || !currentUser) return
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${opportunityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `opportunity_id=eq.${opportunityId}`,
        },
        (payload) => {
          void (async () => {
            const mapped = await hydrateChatMessageFromInsert(
              supabase,
              payload.new
            )
            if (!mapped) {
              void loadMessages({ silent: true })
              return
            }
            setMessages((prev) => {
              let base = prev
              if (mapped.senderId === currentUser.id) {
                const idx = prev.findIndex(
                  (m) =>
                    m.pending &&
                    m.isMe &&
                    m.senderId === mapped.senderId &&
                    m.content === mapped.content
                )
                if (idx >= 0) {
                  base = [...prev.slice(0, idx), ...prev.slice(idx + 1)]
                }
              }
              return mergeMessageSorted(base, {
                ...mapped,
                isMe: mapped.senderId === currentUser.id,
              })
            })
          })()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [opportunityId, currentUser, loadMessages])

  useEffect(() => {
    if (loadingOlder) {
      const last = messages[messages.length - 1]?.id ?? null
      if (last) prevLastMessageIdRef.current = last
      return
    }
    if (messages.length === 0) {
      prevLastMessageIdRef.current = null
      return
    }
    const lastId = messages[messages.length - 1]?.id ?? null
    const prevLast = prevLastMessageIdRef.current
    if (prevLast === null) {
      prevLastMessageIdRef.current = lastId
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: false })
      )
      return
    }
    if (lastId !== prevLast) {
      prevLastMessageIdRef.current = lastId
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: true })
      )
      return
    }
    prevLastMessageIdRef.current = lastId
  }, [messages, loadingOlder])

  const renderMessage = useCallback(
    ({ item: message }: ListRenderItemInfo<UiMessage>) => (
      <View
        style={[
          styles.msgRow,
          message.isMe ? styles.msgRowMe : styles.msgRowThem,
          message.pending && styles.msgRowPending,
        ]}
      >
        {!message.isMe ? (
          <Image
            source={{ uri: message.senderPhoto }}
            style={styles.msgAvatar}
          />
        ) : null}
        <View
          style={[
            styles.bubble,
            message.isMe ? styles.bubbleMe : styles.bubbleThem,
          ]}
        >
          {!message.isMe ? (
            <Text style={styles.senderName}>{message.senderName}</Text>
          ) : null}
          <Text
            style={[
              styles.msgText,
              message.isMe ? styles.msgTextMe : styles.msgTextThem,
            ]}
          >
            {message.content}
          </Text>
          <Text
            style={[
              styles.msgTime,
              message.isMe ? styles.msgTimeMe : styles.msgTimeThem,
            ]}
          >
            {formatMatchClock(message.createdAt)}
            {message.pending ? ' · …' : ''}
          </Text>
        </View>
      </View>
    ),
    []
  )

  const handleSend = async () => {
    if (
      !newMessage.trim() ||
      !currentUser ||
      !opportunityId ||
      !isSupabaseConfigured() ||
      isSending
    ) {
      return
    }
    if (!chatOpen) {
      Alert.alert(
        'Chat cerrado',
        'Este chat ya no admite nuevos mensajes.'
      )
      return
    }

    const supabase = createClient()
    const trimmed = newMessage.trim()
    const tempId = `pending:${Date.now().toString(36)}:${Math.random()
      .toString(36)
      .slice(2, 10)}`

    const pendingMsg: UiMessage = {
      id: tempId,
      senderId: currentUser.id,
      content: trimmed,
      createdAt: new Date(),
      senderName: currentUser.name,
      senderPhoto: currentUser.photo || DEFAULT_AVATAR,
      isMe: true,
      pending: true,
    }
    setMessages((p) => mergeMessageSorted(p, pendingMsg))
    setNewMessage('')
    setIsSending(true)

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        opportunity_id: opportunityId,
        sender_id: currentUser.id,
        content: trimmed,
      })
      .select('id, sender_id, content, created_at')
      .single()

    if (error) {
      setMessages((p) => p.filter((m) => m.id !== tempId))
      setNewMessage(trimmed)
      Alert.alert('Error', error.message)
      setIsSending(false)
      return
    }

    trackProductEvent(ProductEventNames.chatMessageSent, {
      userId: currentUser.id,
      metadata: { opportunity_id: opportunityId },
      supabase,
    })

    if (inserted) {
      const ui: UiMessage = {
        id: inserted.id as string,
        senderId: inserted.sender_id as string,
        content: inserted.content as string,
        createdAt: new Date(inserted.created_at as string),
        senderName: currentUser.name,
        senderPhoto: currentUser.photo || DEFAULT_AVATAR,
        isMe: true,
      }
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== tempId)
        const next = mergeMessageSorted(without, ui)
        queueMicrotask(() => {
          setThreadSnapshot(opportunityId, {
            hasMoreOlder: hasMoreOlderRef.current,
            messages: toCachedRows(next),
          })
        })
        return next
      })
    } else {
      setMessages((p) => p.filter((m) => m.id !== tempId))
      void loadMessages({ silent: true })
    }
    setIsSending(false)
  }

  const goBack = () => router.back()

  if (!currentUser) {
    return null
  }

  if (!opportunityId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.muted}>No hay partido seleccionado.</Text>
          <Pressable style={styles.btn} onPress={goBack}>
            <Text style={styles.btnText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  if (!opportunity) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Cargando partido…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!canAccess) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.muted}>No tienes acceso a este chat.</Text>
          <Pressable style={styles.btn} onPress={goBack}>
            <Text style={styles.btnText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <Pressable onPress={goBack} hitSlop={12}>
            <Text style={styles.back}>‹ Atrás</Text>
          </Pressable>
          <View style={styles.headerMid}>
            <Image
              source={{ uri: opportunity.creatorPhoto }}
              style={styles.headerAvatar}
            />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {opportunity.title}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {opportunity.venue} · {formatMatchDateTime(opportunity.dateTime)}
              </Text>
            </View>
          </View>
          <Pressable onPress={() => setShowInfo((v) => !v)} hitSlop={8}>
            <Text style={styles.infoBtn}>ℹ️</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.detailLink}
          onPress={() => router.push(`/partidos/${opportunity.id}`)}
        >
          <Text style={styles.detailLinkText}>Ver detalle del partido</Text>
        </Pressable>

        {currentUser ? (
          <MatchCompletionPanel
            opportunity={opportunity}
            currentUserId={currentUser.id}
            isConfirmedParticipant={participatingOpportunityIds.includes(
              opportunity.id
            )}
            myRating={myRating}
            loadingRating={loadingRating}
            onReloadMyRating={() => void loadMyRating()}
            finalizeMatchOpportunity={finalizeMatchOpportunity}
            suspendMatchOpportunity={suspendMatchOpportunity}
            submitMatchRating={submitMatchRating}
          />
        ) : null}

        {showInfo ? (
          <ScrollView
            style={styles.infoPanel}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.infoLine}>
              📅 {formatMatchWeekdayDate(opportunity.dateTime)}{' '}
              {formatMatchClock(opportunity.dateTime)} hrs
            </Text>
            <Text style={styles.infoLine}>📍 {opportunity.venue}</Text>
            <Text style={styles.infoMeta}>
              Organiza: {opportunity.creatorName}
            </Text>
            {opportunity.status === 'cancelled' && opportunity.suspendedReason ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnTitle}>Partido suspendido</Text>
                <Text style={styles.warnBody}>{opportunity.suspendedReason}</Text>
              </View>
            ) : null}
            <Text style={styles.partTitle}>Participantes</Text>
            {loadingParticipants ? (
              <Text style={styles.infoMeta}>Cargando…</Text>
            ) : participants.length > 0 ? (
              participants.map((p) => (
                <View key={p.id} style={styles.partRow}>
                  <Image source={{ uri: p.photo }} style={styles.partAvatar} />
                  <Text style={styles.partName} numberOfLines={1}>
                    {p.name}
                    {(opportunity.type === 'open' || opportunity.type === 'players') &&
                    p.isGoalkeeper
                      ? ' 🧤'
                      : ''}
                  </Text>
                  <Text style={styles.partStatus}>
                    {participantStatusLabel(p.status)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.infoMeta}>Sin participantes aún.</Text>
            )}
          </ScrollView>
        ) : null}

        <FlashList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          style={styles.msgScroll}
          contentContainerStyle={styles.msgContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            hasMoreOlder ? (
              <View style={styles.olderHeader}>
                {loadingOlder ? (
                  <ActivityIndicator color="#6b7280" />
                ) : (
                  <Text style={styles.olderHint}>
                    Desliza arriba para cargar anteriores
                  </Text>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <Text style={styles.loadingText}>Cargando mensajes…</Text>
            ) : (
              <Text style={styles.loadingText}>Sin mensajes aún.</Text>
            )
          }
          onStartReached={() => {
            if (hasMoreOlder && !loadingOlderRef.current) {
              void loadOlderMessages()
            }
          }}
          onStartReachedThreshold={0.25}
          maintainVisibleContentPosition={{
            startRenderingFromBottom: true,
            autoscrollToTopThreshold: 80,
          }}
        />

        <View style={styles.inputBar}>
          {!chatOpen ? (
            <View style={styles.closedBanner}>
              {opportunity.status === 'cancelled' ? (
                <Text style={styles.closedText}>
                  Este partido fue cancelado; el chat no admite nuevos mensajes.
                </Text>
              ) : opportunity.status === 'completed' && opportunity.finalizedAt ? (
                <Text style={styles.closedText}>
                  Chat cerrado: pasaron las 48 h tras finalizar el partido. Puedes
                  leer el historial arriba.
                </Text>
              ) : (
                <Text style={styles.closedText}>
                  No se pueden enviar mensajes en este chat.
                </Text>
              )}
            </View>
          ) : null}
          {chatOpen &&
          opportunity.status === 'completed' &&
          opportunity.finalizedAt ? (
            <Text style={styles.hintClose}>
              El chat se cierra {formatRelativeUntil(getRatingDeadline(opportunity.finalizedAt))}
            </Text>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={
                chatOpen ? 'Escribe un mensaje…' : 'Chat cerrado — solo lectura'
              }
              placeholderTextColor="#9ca3af"
              value={newMessage}
              onChangeText={setNewMessage}
              editable={chatOpen}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[
                styles.sendBtn,
                (!newMessage.trim() || !chatOpen || isSending) &&
                  styles.sendBtnOff,
              ]}
              onPress={() => void handleSend()}
              disabled={!newMessage.trim() || !chatOpen || isSending}
            >
              <Text style={styles.sendBtnText}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  muted: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
  btn: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  back: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  headerMid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  headerSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  infoBtn: { fontSize: 22 },
  detailLink: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  detailLinkText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  infoPanel: {
    maxHeight: 220,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  infoLine: { fontSize: 14, color: '#111', marginBottom: 6 },
  infoMeta: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  warnBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    padding: 10,
    marginBottom: 10,
  },
  warnTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  warnBody: { fontSize: 14, color: '#7f1d1d' },
  partTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 8,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  partAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
  },
  partName: { flex: 1, fontSize: 14, color: '#111' },
  partStatus: { fontSize: 11, color: '#6b7280' },
  msgScroll: { flex: 1 },
  msgContent: { padding: 16, paddingBottom: 8 },
  olderHeader: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  olderHint: { fontSize: 12, color: '#9ca3af' },
  loadingText: { textAlign: 'center', color: '#6b7280', paddingVertical: 24 },
  msgRow: {
    width: '100%',
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  msgRowPending: { opacity: 0.72 },
  msgAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: {
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: '#f3f4f6',
    borderBottomLeftRadius: 4,
  },
  senderName: { fontSize: 10, color: '#6b7280', marginBottom: 4 },
  msgText: { fontSize: 15, lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTextThem: { color: '#111' },
  msgTime: { fontSize: 10, marginTop: 4 },
  msgTimeMe: { color: 'rgba(255,255,255,0.75)' },
  msgTimeThem: { color: '#9ca3af' },
  inputBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
  },
  closedBanner: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  closedText: { fontSize: 12, color: '#4b5563', lineHeight: 18 },
  hintClose: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#f9fafb',
  },
  sendBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
  },
  sendBtnOff: { opacity: 0.45 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
