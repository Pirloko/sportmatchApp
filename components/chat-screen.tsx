import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  formatMatchClock,
  formatMatchDateTime,
  formatMatchWeekdayDate,
  formatRelativeUntil,
} from '../lib/format-match'
import { useApp } from '../lib/app-provider'
import { useThemePreference } from '../lib/theme-context'
import {
  ProductEventNames,
  trackProductEvent,
} from '../lib/telemetry/product-analytics'
import { createClient, isSupabaseConfigured } from '../lib/supabase/client'
import {
  fetchMessagesForOpportunity,
  fetchParticipantsForOpportunity,
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

type UiMessage = ChatMessageRow & { isMe: boolean }

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
  const scrollRef = useRef<ScrollView>(null)

  const opportunity = useMemo(
    () =>
      opportunityId
        ? matchOpportunities.find((m) => m.id === opportunityId)
        : undefined,
    [matchOpportunities, opportunityId]
  )

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

  const loadMessages = useCallback(async () => {
    if (!opportunityId || !currentUser || !isSupabaseConfigured()) {
      setMessages([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const rows = await fetchMessagesForOpportunity(supabase, opportunityId)
      setMessages(
        rows.map((m) => ({
          ...m,
          isMe: m.senderId === currentUser.id,
        }))
      )
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los mensajes')
    } finally {
      setLoading(false)
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
    void loadParticipants()
  }, [loadParticipants])

  useEffect(() => {
    void loadMyRating()
  }, [loadMyRating])

  useEffect(() => {
    if (!opportunityId || !isSupabaseConfigured()) return
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
        () => {
          void loadMessages()
          void loadParticipants()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [opportunityId, loadMessages, loadParticipants])

  const handleSend = async () => {
    if (
      !newMessage.trim() ||
      !currentUser ||
      !opportunityId ||
      !isSupabaseConfigured()
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
    const { error } = await supabase.from('messages').insert({
      opportunity_id: opportunityId,
      sender_id: currentUser.id,
      content: newMessage.trim(),
    })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    trackProductEvent(ProductEventNames.chatMessageSent, {
      userId: currentUser.id,
      metadata: { opportunity_id: opportunityId },
      supabase,
    })

    setNewMessage('')
    void loadMessages()
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

        <ScrollView
          ref={scrollRef}
          style={styles.msgScroll}
          contentContainerStyle={styles.msgContent}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
        >
          {loading && messages.length === 0 ? (
            <Text style={styles.loadingText}>Cargando mensajes…</Text>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.msgRow,
                  message.isMe ? styles.msgRowMe : styles.msgRowThem,
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
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>

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
                (!newMessage.trim() || !chatOpen) && styles.sendBtnOff,
              ]}
              onPress={() => void handleSend()}
              disabled={!newMessage.trim() || !chatOpen}
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
