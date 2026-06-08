import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { useScreenTheme, type ScreenTheme } from '../lib/theme-ui'
import type { MatchOpportunity, TeamPickRole, TeamPickTeam } from '../lib/types'

type Props = {
  visible: boolean
  onClose: () => void
  opportunity: MatchOpportunity | null
  initialJoinCode?: string
  onJoin: (payload: {
    team: TeamPickTeam
    role: TeamPickRole
    joinCode?: string
  }) => Promise<boolean>
}

function isPrivateTeamPick(opp: MatchOpportunity | null): boolean {
  return opp?.type === 'team_pick_private'
}

export function JoinTeamPickModal({
  visible,
  onClose,
  opportunity,
  onJoin,
  initialJoinCode,
}: Props) {
  const theme = useScreenTheme()
  const styles = useMemo(() => createModalStyles(theme), [theme])
  const [submitting, setSubmitting] = useState(false)
  const [team, setTeam] = useState<TeamPickTeam>('A')
  const [role, setRole] = useState<TeamPickRole>('defensa')
  const [joinCode, setJoinCode] = useState(initialJoinCode ?? '')

  const privateMode = isPrivateTeamPick(opportunity)
  const codeValid = !privateMode || /^[0-9]{4}$/.test(joinCode.trim())
  const canSubmit = opportunity != null && !submitting && codeValid

  const title = useMemo(() => opportunity?.title ?? 'Selección de equipos', [opportunity])

  const handleJoin = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const ok = await onJoin({
        team,
        role,
        joinCode: privateMode ? joinCode.trim() : undefined,
      })
      if (ok) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (!opportunity) return null

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.wrap}>
        <Pressable style={styles.fill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Unirte a selección de equipos</Text>
          <Text style={styles.sub}>
            {title} — elige equipo y tu rol en cancha.
          </Text>

          <Text style={styles.label}>Equipo</Text>
          <View style={styles.row}>
            <Choice
              label="Equipo A"
              active={team === 'A'}
              styles={styles}
              onPress={() => setTeam('A')}
            />
            <Choice
              label="Equipo B"
              active={team === 'B'}
              styles={styles}
              onPress={() => setTeam('B')}
            />
          </View>

          <Text style={styles.label}>Rol</Text>
          <View style={styles.grid}>
            <Choice
              label="Arquero"
              active={role === 'gk'}
              styles={styles}
              onPress={() => setRole('gk')}
            />
            <Choice
              label="Defensa"
              active={role === 'defensa'}
              styles={styles}
              onPress={() => setRole('defensa')}
            />
            <Choice
              label="Mediocampista"
              active={role === 'mediocampista'}
              styles={styles}
              onPress={() => setRole('mediocampista')}
            />
            <Choice
              label="Delantero"
              active={role === 'delantero'}
              styles={styles}
              onPress={() => setRole('delantero')}
            />
          </View>

          {privateMode ? (
            <>
              <Text style={styles.label}>Código privado</Text>
              <TextInput
                style={styles.input}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                keyboardType="number-pad"
                maxLength={4}
                placeholderTextColor={theme.textMuted}
              />
              {!codeValid ? (
                <Text style={styles.error}>
                  Ingresa un código válido de 4 dígitos.
                </Text>
              ) : null}
            </>
          ) : null}

          {submitting ? (
            <ActivityIndicator
              style={{ marginVertical: 12 }}
              color={theme.primary}
            />
          ) : (
            <>
              <Pressable
                style={[styles.btnPrimary, !canSubmit && styles.btnDisabled]}
                disabled={!canSubmit}
                onPress={() => void handleJoin()}
              >
                <Text style={styles.btnPrimaryText}>Confirmar unión</Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={onClose}>
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

function Choice({
  label,
  active,
  styles: s,
  onPress,
}: {
  label: string
  active: boolean
  styles: ReturnType<typeof createModalStyles>
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.choice, active && s.choiceOn]}
    >
      <Text style={[s.choiceText, active && s.choiceTextOn]}>{label}</Text>
    </Pressable>
  )
}

function createModalStyles(theme: ScreenTheme) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'flex-end' },
    fill: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay,
    },
    sheet: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      paddingBottom: 28,
      backgroundColor: theme.card,
      borderTopColor: theme.modalSheetTopBorder,
      borderTopWidth: theme.isDark ? 1 : 0,
    },
    title: { fontSize: 18, fontWeight: '700', color: theme.text },
    sub: { fontSize: 14, marginTop: 6, marginBottom: 14, color: theme.textMuted },
    label: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: theme.text },
    row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    choice: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.chipBorder,
      backgroundColor: theme.chipBg,
    },
    choiceOn: {
      borderColor: theme.primary,
      backgroundColor: theme.selectedTint,
    },
    choiceText: { fontSize: 14, fontWeight: '600', color: theme.text },
    choiceTextOn: { color: theme.link },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 18,
      textAlign: 'center',
      letterSpacing: 6,
      borderColor: theme.inputBorder,
      color: theme.text,
      backgroundColor: theme.inputBg,
    },
    error: { marginTop: 6, fontSize: 12, color: theme.danger },
    btnPrimary: {
      marginTop: 8,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: theme.primary,
    },
    btnPrimaryText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.primaryBtnText,
    },
    btnGhost: { paddingVertical: 12, alignItems: 'center' },
    btnGhostText: { fontSize: 16, color: theme.textMuted },
    btnDisabled: { opacity: 0.45 },
  })
}
