import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import type { MatchOpportunity, RivalResult } from '../lib/types'
import {
  filterMvpVoteCandidates,
  userCanSubmitMatchReview,
} from '../lib/match-review-eligibility'
import type { OpportunityParticipantRow } from '../lib/supabase/message-queries'
import { type MatchOpportunityRatingRow } from '../lib/supabase/rating-queries'
import { useScreenTheme } from '../lib/theme-ui'

function isTeamPickType(type: MatchOpportunity['type']): boolean {
  return (
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

const SUSPEND_PRESET_REASONS = [
  'Mal tiempo o lluvia',
  'Cancha no disponible o cancelada',
  'No se completó el grupo de jugadores',
  'Motivos de salud o lesión',
  'Conflicto de horario o agenda',
] as const

function StarRow({
  label,
  value,
  onChange,
  disabled,
  styles: s,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  disabled?: boolean
  styles: ReturnType<typeof createCompletionStyles>
}) {
  return (
    <View style={s.starBlock}>
      <Text style={s.starLabel}>{label}</Text>
      <View style={s.starRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            disabled={disabled}
            onPress={() => onChange(n)}
            style={[s.starBtn, value >= n ? s.starBtnOn : s.starBtnOff]}
          >
            <Text style={[s.starGlyph, value >= n && s.starGlyphOn]}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

type Props = {
  opportunity: MatchOpportunity
  currentUserId: string
  participants: OpportunityParticipantRow[]
  myRating: MatchOpportunityRatingRow | null
  loadingRating: boolean
  onReloadMyRating: () => void
  finalizeMatchOpportunity: (
    opportunityId: string,
    outcome:
      | { kind: 'rival'; rivalResult: RivalResult }
      | { kind: 'casual' }
      | { kind: 'casual_scored'; result: RivalResult }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  suspendMatchOpportunity: (
    opportunityId: string,
    reason: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  submitMatchRating: (
    opportunityId: string,
    payload: {
      venueRating: number
      matchRating: number
      levelRating: number
      mvpUserId: string
      comment?: string
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

export function MatchCompletionPanel({
  opportunity,
  currentUserId,
  participants,
  myRating,
  loadingRating,
  onReloadMyRating,
  finalizeMatchOpportunity,
  suspendMatchOpportunity,
  submitMatchRating,
}: Props) {
  const theme = useScreenTheme()
  const styles = useMemo(() => createCompletionStyles(theme), [theme])
  const isCreator = opportunity.creatorId === currentUserId
  const completed = opportunity.status === 'completed'
  const finalizedAt = opportunity.finalizedAt
  const mvpCandidates = useMemo(
    () => filterMvpVoteCandidates(participants, currentUserId),
    [participants, currentUserId]
  )
  const canRate =
    completed &&
    finalizedAt != null &&
    userCanSubmitMatchReview(currentUserId, participants) &&
    !myRating &&
    !loadingRating

  const [finalizing, setFinalizing] = useState(false)
  const [rivalPick, setRivalPick] = useState<RivalResult | null>(null)
  const [casualPick, setCasualPick] = useState<RivalResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [suspendExpanded, setSuspendExpanded] = useState(false)
  const [suspendChoice, setSuspendChoice] = useState<number | 'other' | null>(
    null
  )
  const [suspendOtherText, setSuspendOtherText] = useState('')

  const [venueStars, setVenueStars] = useState(0)
  const [matchStars, setMatchStars] = useState(0)
  const [levelStars, setLevelStars] = useState(0)
  const [mvpUserId, setMvpUserId] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const needsResolveAfterMidnight = (() => {
    if (!isCreator) return false
    if (completed || opportunity.status === 'cancelled') return false
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    return opportunity.dateTime.getTime() < midnight.getTime()
  })()

  const showFinalize =
    isCreator && !completed && opportunity.status !== 'cancelled'

  const resolvedSuspendReason = (): string | null => {
    if (suspendChoice === null) return null
    if (typeof suspendChoice === 'number') {
      return SUSPEND_PRESET_REASONS[suspendChoice] ?? null
    }
    const t = suspendOtherText.trim()
    if (t.length < 5) return null
    return `Otro: ${t}`
  }

  const handleSuspend = async () => {
    const reason = resolvedSuspendReason()
    if (!reason) return
    setSuspending(true)
    try {
      const res = await suspendMatchOpportunity(opportunity.id, reason)
      if (!res.ok) {
        Alert.alert('No se pudo suspender', res.error)
        return
      }
      Alert.alert('Listo', 'Partido suspendido.')
      setSuspendExpanded(false)
      setSuspendChoice(null)
      setSuspendOtherText('')
    } finally {
      setSuspending(false)
    }
  }

  const canConfirmSuspend = resolvedSuspendReason() !== null && !suspending

  const outcomeLine = () => {
    if (!completed || !finalizedAt) return null
    if (opportunity.type === 'rival' && opportunity.rivalResult) {
      const map: Record<RivalResult, string> = {
        creator_team: 'Ganó el equipo del organizador',
        rival_team: 'Ganó el equipo rival',
        draw: 'Empate',
      }
      return (
        <Text style={styles.outcomeLine}>
          🏆 {map[opportunity.rivalResult]}
        </Text>
      )
    }
    if (opportunity.casualCompleted) {
      if (opportunity.rivalResult) {
        const map: Record<RivalResult, string> = {
          creator_team: 'Ganó Equipo A',
          rival_team: 'Ganó Equipo B',
          draw: 'Empate',
        }
        return (
          <Text style={styles.outcomeLine}>
            🏆 {map[opportunity.rivalResult]}
          </Text>
        )
      }
      return (
        <Text style={styles.outcomeLine}>
          ✓ Partido jugado (sin marcador de equipos)
        </Text>
      )
    }
    return null
  }

  const handleFinalize = async () => {
    const successMsg =
      'Partido finalizado. Los jugadores pueden dejar su reseña cuando quieran.'

    if (opportunity.type === 'rival') {
      if (!rivalPick) return
      setFinalizing(true)
      try {
        const res = await finalizeMatchOpportunity(opportunity.id, {
          kind: 'rival',
          rivalResult: rivalPick,
        })
        if (!res.ok) {
          Alert.alert('No se pudo finalizar', res.error)
          return
        }
        Alert.alert('Listo', successMsg)
      } finally {
        setFinalizing(false)
      }
      return
    }
    if (opportunity.type === 'open' || isTeamPickType(opportunity.type)) {
      if (!casualPick) return
      setFinalizing(true)
      try {
        const res = await finalizeMatchOpportunity(opportunity.id, {
          kind: 'casual_scored',
          result: casualPick,
        })
        if (!res.ok) {
          Alert.alert('No se pudo finalizar', res.error)
          return
        }
        Alert.alert('Listo', successMsg)
      } finally {
        setFinalizing(false)
      }
      return
    }
    setFinalizing(true)
    try {
      const res = await finalizeMatchOpportunity(opportunity.id, {
        kind: 'casual',
      })
      if (!res.ok) {
        Alert.alert('No se pudo finalizar', res.error)
        return
      }
      Alert.alert('Listo', successMsg)
    } finally {
      setFinalizing(false)
    }
  }

  const handleSubmitRating = async () => {
    if (!venueStars || !matchStars || !levelStars || !mvpUserId) return
    setSubmitting(true)
    try {
      const res = await submitMatchRating(opportunity.id, {
        venueRating: venueStars,
        matchRating: matchStars,
        levelRating: levelStars,
        mvpUserId,
        comment: comment.trim() || undefined,
      })
      if (!res.ok) {
        Alert.alert('Error', res.error)
        return
      }
      Alert.alert('Gracias', '¡Gracias por tu reseña!')
      onReloadMyRating()
      setComment('')
      setVenueStars(0)
      setMatchStars(0)
      setLevelStars(0)
      setMvpUserId(null)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmitReview =
    venueStars > 0 &&
    matchStars > 0 &&
    levelStars > 0 &&
    mvpUserId != null &&
    !submitting

  if (!showFinalize && !completed) return null

  return (
    <View style={styles.wrap}>
      {needsResolveAfterMidnight && (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Este partido ya pasó</Text>
          <Text style={styles.warnBody}>
            Para que no aparezca como disponible, confirma si se jugó o
            suspéndelo con un motivo.
          </Text>
        </View>
      )}

      {showFinalize && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {needsResolveAfterMidnight ? 'Resolver partido' : 'Finalizar partido'}
          </Text>
          <Text style={styles.hint}>
            Al cerrar, se registrará el resultado y los jugadores podrán dejar
            su reseña.
          </Text>
          {opportunity.type === 'rival' && (
            <View style={styles.radioBlock}>
              <Text style={styles.radioLabel}>Resultado</Text>
              {(
                [
                  ['creator_team', 'Ganó el equipo del organizador'],
                  ['rival_team', 'Ganó el equipo rival'],
                  ['draw', 'Empate'],
                ] as const
              ).map(([val, label]) => (
                <Pressable
                  key={val}
                  style={[
                    styles.radioRow,
                    rivalPick === val && styles.radioRowSelected,
                  ]}
                  onPress={() => setRivalPick(val)}
                >
                  <View
                    style={[
                      styles.radioDot,
                      rivalPick === val && styles.radioDotOn,
                    ]}
                  />
                  <Text style={styles.radioText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {(opportunity.type === 'open' || isTeamPickType(opportunity.type)) && (
            <View style={styles.radioBlock}>
              <Text style={styles.radioLabel}>Resultado</Text>
              {(
                [
                  ['creator_team', 'Ganó Equipo A'],
                  ['rival_team', 'Ganó Equipo B'],
                  ['draw', 'Empate'],
                ] as const
              ).map(([val, label]) => (
                <Pressable
                  key={val}
                  style={[
                    styles.radioRow,
                    casualPick === val && styles.radioRowSelected,
                  ]}
                  onPress={() => setCasualPick(val)}
                >
                  <View
                    style={[
                      styles.radioDot,
                      casualPick === val && styles.radioDotOn,
                    ]}
                  />
                  <Text style={styles.radioText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            style={[styles.primaryBtn, finalizing && styles.btnDisabled]}
            disabled={
              finalizing ||
              (opportunity.type === 'rival' && !rivalPick) ||
              ((opportunity.type === 'open' || isTeamPickType(opportunity.type)) &&
                !casualPick)
            }
            onPress={() => void handleFinalize()}
          >
            {finalizing ? (
              <ActivityIndicator color={theme.primaryBtnText} />
            ) : (
              <Text style={styles.primaryBtnText}>Marcar partido como finalizado</Text>
            )}
          </Pressable>

          <View style={styles.suspendDivider}>
            <Text style={styles.sectionTitle}>Suspender partido</Text>
            <Text style={styles.hint}>
              Si no se jugará, elige un motivo y confirma la suspensión.
            </Text>
            <Pressable
              style={styles.suspendToggle}
              disabled={suspending}
              onPress={() => {
                setSuspendExpanded((v) => !v)
                if (suspendExpanded) {
                  setSuspendChoice(null)
                  setSuspendOtherText('')
                }
              }}
            >
              <Text style={styles.suspendToggleText}>Suspender partido</Text>
              <Text style={styles.chevron}>{suspendExpanded ? '▲' : '▼'}</Text>
            </Pressable>

            {suspendExpanded && (
              <View style={styles.suspendInner}>
                <Text style={styles.subLabel}>Motivo de la suspensión</Text>
                {SUSPEND_PRESET_REASONS.map((label, i) => (
                  <Pressable
                    key={label}
                    style={[
                      styles.radioRow,
                      suspendChoice === i && styles.radioRowSelected,
                    ]}
                    onPress={() => {
                      setSuspendChoice(i)
                      setSuspendOtherText('')
                    }}
                  >
                    <View
                      style={[
                        styles.radioDot,
                        suspendChoice === i && styles.radioDotOn,
                      ]}
                    />
                    <Text style={styles.radioText}>{label}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[
                    styles.radioRow,
                    suspendChoice === 'other' && styles.radioRowSelected,
                  ]}
                  onPress={() => setSuspendChoice('other')}
                >
                  <View
                    style={[
                      styles.radioDot,
                      suspendChoice === 'other' && styles.radioDotOn,
                    ]}
                  />
                  <Text style={styles.radioText}>Otro</Text>
                </Pressable>
                {suspendChoice === 'other' && (
                  <>
                    <TextInput
                      style={styles.textArea}
                      value={suspendOtherText}
                      onChangeText={setSuspendOtherText}
                      placeholder="Describe el motivo…"
                      placeholderTextColor={theme.textMuted}
                      multiline
                      maxLength={1000}
                      editable={!suspending}
                    />
                    <Text style={styles.miniHint}>Mínimo 5 caracteres.</Text>
                  </>
                )}
                <View style={styles.suspendActions}>
                  <Pressable
                    onPress={() => {
                      setSuspendExpanded(false)
                      setSuspendChoice(null)
                      setSuspendOtherText('')
                    }}
                  >
                    <Text style={styles.ghostText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.dangerOutlineBtn,
                      (!canConfirmSuspend || suspending) && styles.btnDisabled,
                    ]}
                    disabled={!canConfirmSuspend || suspending}
                    onPress={() => void handleSuspend()}
                  >
                    {suspending ? (
                      <ActivityIndicator color={theme.danger} />
                    ) : (
                      <Text style={styles.dangerOutlineText}>
                        Confirmar suspensión
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {completed && (
        <View style={styles.section}>
          <Text style={styles.doneBadge}>Partido finalizado</Text>
          {outcomeLine()}
        </View>
      )}

      {loadingRating && (
        <Text style={styles.mutedSmall}>Cargando tu reseña…</Text>
      )}

      {myRating && (
        <Text style={styles.thanks}>
          Ya enviaste tu reseña para este partido. ¡Gracias!
        </Text>
      )}

      {canRate && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tu reseña (una sola vez)</Text>
          <StarRow
            label="Recinto deportivo"
            value={venueStars}
            onChange={setVenueStars}
            disabled={submitting}
            styles={styles}
          />
          <StarRow
            label="Ambiente del partido"
            value={matchStars}
            onChange={setMatchStars}
            disabled={submitting}
            styles={styles}
          />
          <StarRow
            label="Nivel del partido"
            value={levelStars}
            onChange={setLevelStars}
            disabled={submitting}
            styles={styles}
          />
          <Text style={styles.inputLabel}>MVP del partido</Text>
          {mvpCandidates.length === 0 ? (
            <Text style={styles.mutedSmall}>
              Cargando participantes para elegir MVP…
            </Text>
          ) : (
            <View style={styles.mvpList}>
              {mvpCandidates.map((p) => {
                const selected = mvpUserId === p.id
                return (
                  <Pressable
                    key={p.id}
                    disabled={submitting}
                    style={[
                      styles.mvpRow,
                      selected && styles.mvpRowSelected,
                    ]}
                    onPress={() => setMvpUserId(p.id)}
                  >
                    <Image source={{ uri: p.photo }} style={styles.mvpAvatar} />
                    <Text style={styles.mvpName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <View
                      style={[
                        styles.radioDot,
                        selected && styles.radioDotOn,
                      ]}
                    />
                  </Pressable>
                )
              })}
            </View>
          )}
          <Text style={styles.inputLabel}>Comentario (opcional)</Text>
          <TextInput
            style={styles.textArea}
            value={comment}
            onChangeText={setComment}
            placeholder="Breve opinión sobre el partido…"
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={2000}
            editable={!submitting}
          />
          <Pressable
            style={[
              styles.primaryBtn,
              !canSubmitReview && styles.btnDisabled,
            ]}
            disabled={!canSubmitReview}
            onPress={() => void handleSubmitRating()}
          >
            {submitting ? (
              <ActivityIndicator color={theme.primaryBtnText} />
            ) : (
              <Text style={styles.primaryBtnText}>Enviar reseña</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  )
}

function createCompletionStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.isDark ? theme.card : theme.chipBg,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    warnBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.45)',
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      padding: 12,
      gap: 4,
    },
    warnTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    warnBody: { fontSize: 13, color: theme.textMuted, lineHeight: 18 },
    section: { gap: 10 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    hint: { fontSize: 12, color: theme.textMuted, lineHeight: 17 },
    radioBlock: { gap: 8 },
    radioLabel: { fontSize: 12, color: theme.textMuted, marginBottom: 2 },
    radioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    radioRowSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.selectedTint,
    },
    radioDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: theme.textMuted,
    },
    radioDotOn: { borderColor: theme.primary, backgroundColor: theme.primary },
    radioText: { flex: 1, fontSize: 14, color: theme.text },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryBtnText: {
      color: theme.primaryBtnText,
      fontSize: 16,
      fontWeight: '700',
    },
    btnDisabled: { opacity: 0.55 },
    suspendDivider: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      gap: 8,
    },
    suspendToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.danger,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    suspendToggleText: {
      color: theme.primaryBtnText,
      fontWeight: '700',
      fontSize: 15,
    },
    chevron: { color: theme.primaryBtnText, fontSize: 14 },
    suspendInner: {
      gap: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: 12,
    },
    subLabel: { fontSize: 12, fontWeight: '600', color: theme.text },
    textArea: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      padding: 10,
      minHeight: 72,
      fontSize: 14,
      color: theme.text,
      textAlignVertical: 'top',
      backgroundColor: theme.inputBg,
    },
    miniHint: { fontSize: 11, color: theme.textMuted },
    suspendActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 16,
      marginTop: 8,
    },
    ghostText: { color: theme.textMuted, fontSize: 14 },
    dangerOutlineBtn: {
      borderWidth: 1,
      borderColor: 'rgba(185, 28, 28, 0.5)',
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 16,
      minWidth: 160,
      alignItems: 'center',
    },
    dangerOutlineText: { color: theme.danger, fontWeight: '600', fontSize: 14 },
    doneBadge: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    outcomeLine: { fontSize: 14, color: theme.textMuted, marginTop: 4 },
    mutedSmall: { fontSize: 12, color: theme.textMuted },
    thanks: { fontSize: 14, color: theme.primary, fontWeight: '600' },
    starBlock: { gap: 6 },
    starLabel: { fontSize: 14, color: theme.text },
    starRow: { flexDirection: 'row', gap: 6 },
    starBtn: {
      padding: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    starBtnOn: {
      borderColor: theme.primary,
      backgroundColor: theme.selectedTint,
    },
    starBtnOff: {},
    starGlyph: { fontSize: 22, color: theme.textMuted },
    starGlyphOn: { color: theme.primary },
    inputLabel: { fontSize: 14, color: theme.text, marginTop: 4 },
    mvpList: { gap: 6 },
    mvpRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    mvpRowSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.selectedTint,
    },
    mvpAvatar: { width: 36, height: 36, borderRadius: 18 },
    mvpName: { flex: 1, fontSize: 14, color: theme.text },
  })
}
