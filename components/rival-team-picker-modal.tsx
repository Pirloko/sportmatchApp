import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { Team } from '../lib/types'

type Props = {
  visible: boolean
  captainTeams: Team[]
  onClose: () => void
  onPickTeam: (teamId: string) => void
}

export function RivalTeamPickerModal({
  visible,
  captainTeams,
  onClose,
  onPickTeam,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.wrap}>
        <Pressable style={styles.fill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>
            Selecciona tu equipo para desafiar
          </Text>
          {captainTeams.map((team) => (
            <Pressable
              key={team.id}
              style={styles.teamRow}
              onPress={() => onPickTeam(team.id)}
            >
              <Text style={styles.teamName}>{team.name}</Text>
              <Text style={styles.teamMeta}>
                {team.members.length}/6 jugadores
              </Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  teamRow: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  teamName: { fontSize: 16, fontWeight: '600', color: '#111' },
  teamMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  cancel: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 16, color: '#6b7280' },
})
