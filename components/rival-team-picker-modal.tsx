import { useMemo } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { Team } from '../lib/types'
import { useScreenTheme } from '../lib/theme-ui'

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
  const theme = useScreenTheme()
  const styles = useMemo(() => createModalStyles(theme), [theme])

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.wrap}>
        <Pressable style={styles.fill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Selecciona tu equipo para desafiar</Text>
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

function createModalStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    fill: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.overlay,
    },
    sheet: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 16,
      paddingBottom: 28,
      backgroundColor: theme.card,
      borderTopColor: theme.modalSheetTopBorder,
      borderTopWidth: theme.isDark ? 1 : 0,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 12,
      color: theme.text,
    },
    teamRow: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 10,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    teamName: { fontSize: 16, fontWeight: '600', color: theme.text },
    teamMeta: { fontSize: 12, marginTop: 4, color: theme.textMuted },
    cancel: { paddingVertical: 14, alignItems: 'center' },
    cancelText: { fontSize: 16, color: theme.textMuted },
  })
}
