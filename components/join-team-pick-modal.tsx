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

import type { MatchOpportunity, TeamPickRole, TeamPickTeam } from '../lib/types'
import { useThemePreference } from '../lib/theme-context'

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
  const { resolved } = useThemePreference()
  const [submitting, setSubmitting] = useState(false)
  const [team, setTeam] = useState<TeamPickTeam>('A')
  const [role, setRole] = useState<TeamPickRole>('defensa')
  const [joinCode, setJoinCode] = useState(initialJoinCode ?? '')

  const privateMode = isPrivateTeamPick(opportunity)
  const dark = resolved === 'dark'
  const codeValid = !privateMode || /^[0-9]{4}$/.test(joinCode.trim())
  const canSubmit = opportunity != null && !submitting && codeValid

  const title = useMemo(() => opportunity?.title ?? 'Team pick', [opportunity])

  if (!opportunity) return null

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

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.wrap}>
        <Pressable
          style={[styles.fill, dark && styles.fillDark]}
          onPress={onClose}
        />
        <View style={[styles.sheet, dark && styles.sheetDark]}>
          <Text style={[styles.title, dark && styles.titleDark]}>
            Unirte a selección de equipos
          </Text>
          <Text style={[styles.sub, dark && styles.subDark]}>
            {title} — elige equipo y tu rol en cancha.
          </Text>

          <Text style={[styles.label, dark && styles.labelDark]}>Equipo</Text>
          <View style={styles.row}>
            <Choice
              label="Equipo A"
              active={team === 'A'}
              dark={dark}
              onPress={() => setTeam('A')}
            />
            <Choice
              label="Equipo B"
              active={team === 'B'}
              dark={dark}
              onPress={() => setTeam('B')}
            />
          </View>

          <Text style={[styles.label, dark && styles.labelDark]}>Rol</Text>
          <View style={styles.grid}>
            <Choice
              label="Arquero"
              active={role === 'gk'}
              dark={dark}
              onPress={() => setRole('gk')}
            />
            <Choice
              label="Defensa"
              active={role === 'defensa'}
              dark={dark}
              onPress={() => setRole('defensa')}
            />
            <Choice
              label="Mediocampista"
              active={role === 'mediocampista'}
              dark={dark}
              onPress={() => setRole('mediocampista')}
            />
            <Choice
              label="Delantero"
              active={role === 'delantero'}
              dark={dark}
              onPress={() => setRole('delantero')}
            />
          </View>

          {privateMode ? (
            <>
              <Text style={[styles.label, dark && styles.labelDark]}>
                Código privado
              </Text>
              <TextInput
                style={[styles.input, dark && styles.inputDark]}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                keyboardType="number-pad"
                maxLength={4}
                placeholderTextColor={dark ? '#6b7280' : '#9ca3af'}
              />
              {!codeValid ? (
                <Text style={styles.error}>Ingresa un código válido de 4 dígitos.</Text>
              ) : null}
            </>
          ) : null}

          {submitting ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
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
                <Text style={[styles.btnGhostText, dark && styles.btnGhostTextDark]}>
                  Cancelar
                </Text>
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
  dark,
  onPress,
}: {
  label: string
  active: boolean
  dark: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.choice,
        dark && styles.choiceDark,
        active && styles.choiceOn,
        active && dark && styles.choiceOnDark,
      ]}
    >
      <Text
        style={[
          styles.choiceText,
          dark && styles.choiceTextDark,
          active && styles.choiceTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  fillDark: {
    backgroundColor: 'rgba(2,6,23,0.72)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
  },
  sheetDark: {
    backgroundColor: '#111827',
    borderTopWidth: 1,
    borderTopColor: 'rgba(116, 212, 93, 0.28)',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  titleDark: { color: '#f9fafb' },
  sub: { fontSize: 14, color: '#6b7280', marginTop: 6, marginBottom: 14 },
  subDark: { color: '#9ca3af' },
  label: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 },
  labelDark: { color: '#e5e7eb' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  choice: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  choiceDark: {
    borderColor: '#374151',
    backgroundColor: '#1f2937',
  },
  choiceOn: {
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  choiceOnDark: {
    borderColor: '#0F4539',
    backgroundColor: 'rgba(15, 69, 57, 0.16)',
  },
  choiceText: { fontSize: 14, color: '#374151', fontWeight: '600' },
  choiceTextDark: { color: '#d1d5db' },
  choiceTextOn: { color: '#1d4ed8' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 6,
    color: '#111',
    backgroundColor: '#f9fafb',
  },
  inputDark: {
    borderColor: '#374151',
    color: '#f9fafb',
    backgroundColor: '#1f2937',
  },
  error: { marginTop: 6, color: '#b91c1c', fontSize: 12 },
  btnPrimary: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnGhost: { paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { color: '#6b7280', fontSize: 16 },
  btnGhostTextDark: { color: '#9ca3af' },
  btnDisabled: { opacity: 0.45 },
})

