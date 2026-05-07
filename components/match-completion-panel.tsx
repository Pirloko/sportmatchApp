import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { formatRelativeUntil } from '../lib/format-match'
import type { MatchOpportunity, RivalResult } from '../lib/types'
function isTeamPickType(type: MatchOpportunity['type']): boolean {
  return (
    type === 'team_pick' ||
    type === 'team_pick_public' ||
    type === 'team_pick_private'
  )
}

import {
  getRatingDeadline,
  isRatingWindowOpen,
  type MatchOpportunityRatingRow,
} from '../lib/supabase/rating-queries'

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
}: {
  label: string
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <View style={styles.starBlock}>
      <Text style={styles.starLabel}>{label}</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            disabled={disabled}
            onPress={() => onChange(n)}
            style={[
              styles.starBtn,
              value >= n ? styles.starBtnOn : styles.starBtnOff,
            ]}
          >
            <Text style={[styles.starGlyph, value >= n && styles.starGlyphOn]}>
              ★
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

type Props = {
  opportunity: MatchOpportunity
  currentUserId: string
  isConfirmedParticipant: boolean
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
      organizerRating: number | null
      matchRating: number
      levelRating: number
      comment?: string
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

export function MatchCompletionPanel({
  opportunity,
  currentUserId,
  isConfirmedParticipant,
  myRating,
  loadingRating,
  onReloadMyRating,
  finalizeMatchOpportunity,
  suspendMatchOpportunity,
  submitMatchRating,
}: Props) {
  const isCreator = opportunity.creatorId === currentUserId
  const completed = opportunity.status === 'completed'
  const needsResolveAfterMidnight = (() => {
    if (!isCreator) return false
    if (completed || opportunity.status === 'cancelled') return false
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    return opportunity.dateTime.getTime() < midnight.getTime()
  })()
  const finalizedAt = opportunity.finalizedAt
  const windowOpen =
    completed && finalizedAt && isRatingWindowOpen(finalizedAt)
  const canRate =
    completed &&
    windowOpen &&
    (isCreator || isConfirmedParticipant) &&
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

  const [orgStars, setOrgStars] = useState(0)
  const [matchStars, setMatchStars] = useState(0)
  const [levelStars, setLevelStars] = useState(0)
  const [comment, setComment] = useState('')

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
        Alert.alert(
          'Listo',
          'Partido finalizado. Los jugadores pueden calificar en las próximas 48 h.'
        )
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
        Alert.alert(
          'Listo',
          'Partido finalizado. Los jugadores pueden calificar en las próximas 48 h.'
        )
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
      Alert.alert(
        'Listo',
        'Partido finalizado. Los jugadores pueden calificar en las próximas 48 h.'
      )
    } finally {
      setFinalizing(false)
    }
  }

  const handleSubmitRating = async () => {
    if (!matchStars || !levelStars) return
    if (!isCreator && !orgStars) return
    setSubmitting(true)
    try {
      const res = await submitMatchRating(opportunity.id, {
        organizerRating: isCreator ? null : orgStars,
        matchRating: matchStars,
        levelRating: levelStars,
        comment: comment.trim() || undefined,
      })
      if (!res.ok) {
        Alert.alert('Error', res.error)
        return
      }
      Alert.alert('Gracias', '¡Gracias por tu calificación!')
      onReloadMyRating()
      setComment('')
    } finally {
      setSubmitting(false)
    }
  }

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
            Al cerrar, se registrará el resultado y se abrirá la ventana de 48 h
            para que los jugadores califiquen.
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
              <ActivityIndicator color="#fff" />
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
                      placeholderTextColor="#9ca3af"
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
                      <ActivityIndicator color="#b91c1c" />
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
          {finalizedAt && windowOpen && (
            <Text style={styles.deadlineHint}>
              Plazo de calificación: termina{' '}
              {formatRelativeUntil(getRatingDeadline(finalizedAt))}
            </Text>
          )}
        </View>
      )}

      {loadingRating && (
        <Text style={styles.mutedSmall}>Cargando tu calificación…</Text>
      )}

      {myRating && (
        <Text style={styles.thanks}>
          Ya enviaste tu calificación para este partido. ¡Gracias!
        </Text>
      )}

      {canRate && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tu calificación (una sola vez)</Text>
          {!isCreator && (
            <StarRow
              label="Gestión del organizador"
              value={orgStars}
              onChange={setOrgStars}
              disabled={submitting}
            />
          )}
          <StarRow
            label="El partido en conjunto (ambiente, fluidez)"
            value={matchStars}
            onChange={setMatchStars}
            disabled={submitting}
          />
          <StarRow
            label="Nivel del partido vs lo anunciado"
            value={levelStars}
            onChange={setLevelStars}
            disabled={submitting}
          />
          <Text style={styles.inputLabel}>Comentario (opcional)</Text>
          <TextInput
            style={styles.textArea}
            value={comment}
            onChangeText={setComment}
            placeholder="Breve opinión sobre el partido…"
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={2000}
            editable={!submitting}
          />
          <Pressable
            style={[
              styles.primaryBtn,
              (submitting ||
                !matchStars ||
                !levelStars ||
                (!isCreator && !orgStars)) &&
                styles.btnDisabled,
            ]}
            disabled={
              submitting ||
              !matchStars ||
              !levelStars ||
              (!isCreator && !orgStars)
            }
            onPress={() => void handleSubmitRating()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Enviar calificación</Text>
            )}
          </Pressable>
        </View>
      )}

      {completed &&
        finalizedAt &&
        !windowOpen &&
        !myRating &&
        (isCreator || isConfirmedParticipant) &&
        !loadingRating && (
          <Text style={styles.mutedSmall}>
            El plazo de 48 h para calificar ya cerró.
          </Text>
        )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
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
  warnTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  warnBody: { fontSize: 13, color: '#57534e', lineHeight: 18 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  hint: { fontSize: 12, color: '#6b7280', lineHeight: 17 },
  radioBlock: { gap: 8 },
  radioLabel: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  radioRowSelected: {
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9ca3af',
  },
  radioDotOn: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  radioText: { flex: 1, fontSize: 14, color: '#374151' },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
  suspendDivider: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  suspendToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#b91c1c',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  suspendToggleText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chevron: { color: '#fff', fontSize: 14 },
  suspendInner: {
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 12,
  },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#111' },
  textArea: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    minHeight: 72,
    fontSize: 14,
    color: '#111',
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
  miniHint: { fontSize: 11, color: '#6b7280' },
  suspendActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  ghostText: { color: '#6b7280', fontSize: 14 },
  dangerOutlineBtn: {
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.5)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 160,
    alignItems: 'center',
  },
  dangerOutlineText: { color: '#b91c1c', fontWeight: '600', fontSize: 14 },
  doneBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  outcomeLine: { fontSize: 14, color: '#4b5563', marginTop: 4 },
  deadlineHint: { fontSize: 12, color: '#6b7280' },
  mutedSmall: { fontSize: 12, color: '#6b7280' },
  thanks: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  starBlock: { gap: 6 },
  starLabel: { fontSize: 14, color: '#374151' },
  starRow: { flexDirection: 'row', gap: 6 },
  starBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  starBtnOn: {
    borderColor: 'rgba(37, 99, 235, 0.45)',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  starBtnOff: {},
  starGlyph: { fontSize: 22, color: '#9ca3af' },
  starGlyphOn: { color: '#2563eb' },
  inputLabel: { fontSize: 14, color: '#374151', marginTop: 4 },
})
