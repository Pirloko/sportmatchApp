import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { levelLabel } from '../lib/format-match'
import { saveRivalTargetTeamId } from '../lib/rival-prefill'
import { teamInviteAbsoluteUrl } from '../lib/team-invite-url'
import { useApp } from '../lib/app-provider'
import { useScreenTheme } from '../lib/theme-ui'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client'
import { fetchTeamPrivateSettings } from '../lib/supabase/team-queries'
import {
  deleteTeamLogoFile,
  uploadTeamLogoFromUri,
} from '../lib/supabase/team-logos'
import {
  rosterCountForDisplay,
  teamIsInPlayerGeo,
  teamRivalFogueo,
} from '../lib/team-discovery'
import {
  TEAM_ROSTER_MAX,
  TEAM_USER_MAX_MEMBERSHIPS,
} from '../lib/team-constants'
import type { Level, RivalChallenge, Team, TeamJoinRequest, TeamPrivateSettings } from '../lib/types'

type TeamsView = 'list' | 'create' | 'detail' | 'invite'

const LEVEL_LABELS: Record<Level, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

const POSITION_LABELS: Record<string, string> = {
  portero: 'Portero',
  defensa: 'Defensa',
  mediocampista: 'Medio',
  delantero: 'Delantero',
}

function positionLabel(p: string): string {
  return POSITION_LABELS[p] ?? p
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

function avatarColorForName(name: string): string {
  const palette = ['#0F4539', '#2563EB', '#7C3AED', '#DC2626', '#D97706', '#0891B2']
  let idx = 0
  for (let i = 0; i < name.length; i++) {
    idx = (idx + name.charCodeAt(i) * 17) % palette.length
  }
  return palette[idx] ?? palette[0]
}

function parseRulesLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return []
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\d+[\).\-\s]+/, '').trim())
    .filter(Boolean)
}

function TeamMemberAvatar({
  photo,
  name,
  size = 44,
}: {
  photo: string
  name: string
  size?: number
}) {
  if (photo?.trim()) {
    return (
      <Image
        source={{ uri: photo }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    )
  }
  const bg = avatarColorForName(name)
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.34 }}>
        {memberInitials(name)}
      </Text>
    </View>
  )
}

function TeamRulesList({
  rules,
  theme,
  ui,
  styles,
}: {
  rules: string[]
  theme: ReturnType<typeof useScreenTheme>
  ui: {
    logoBoxBg: string
    logoBoxBorder: string
    primaryAccent: string
  }
  styles: ReturnType<typeof createStyles>
}) {
  if (rules.length === 0) return null
  return (
    <View
      style={[
        styles.teamRulesCard,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={styles.teamRulesHeader}>
        <View
          style={[
            styles.teamRulesIconWrap,
            {
              backgroundColor: ui.logoBoxBg,
              borderColor: ui.logoBoxBorder,
            },
          ]}
        >
          <Ionicons name="list-outline" size={18} color={ui.primaryAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.teamRulesTitle, { color: theme.text }]}>
            Reglas del equipo
          </Text>
          <Text style={[styles.teamRulesSub, { color: theme.textMuted }]}>
            {rules.length} {rules.length === 1 ? 'norma acordada' : 'normas acordadas'}
          </Text>
        </View>
      </View>
      <View style={styles.teamRulesList}>
        {rules.map((rule, idx) => (
          <View
            key={`${idx}-${rule.slice(0, 12)}`}
            style={[
              styles.teamRuleRow,
              idx > 0 && [
                styles.teamRuleRowDivider,
                { borderTopColor: theme.border },
              ],
            ]}
          >
            <View
              style={[
                styles.teamRuleNum,
                {
                  backgroundColor: ui.logoBoxBg,
                  borderColor: ui.logoBoxBorder,
                },
              ]}
            >
              <Text style={[styles.teamRuleNumText, { color: ui.primaryAccent }]}>
                {idx + 1}
              </Text>
            </View>
            <Text style={[styles.teamRuleText, { color: theme.text }]}>{rule}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function TeamsScreen() {
  const {
    currentUser,
    teams,
    getUserTeams,
    getFilteredTeams,
    getFilteredUsers,
    createTeam,
    updateTeam,
    deleteTeam,
    leaveTeam,
    updateTeamPrivateSettings,
    inviteToTeam,
    teamInvites,
    rivalChallenges,
    respondToRivalChallenge,
    teamJoinRequests,
    requestToJoinTeam,
    respondToJoinRequest,
    cancelJoinRequest,
    respondToInvite,
    teamsDetailFocusTeamId,
    setTeamsDetailFocusTeamId,
  } = useApp()
  const theme = useScreenTheme()
  const styles = useMemo(() => createStyles(theme), [theme])

  const [view, setView] = useState<TeamsView>('list')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamLevel, setTeamLevel] = useState<Level>('intermedio')
  const [teamDescription, setTeamDescription] = useState('')
  const [draftTeamName, setDraftTeamName] = useState('')
  const [draftTeamDescription, setDraftTeamDescription] = useState('')
  const [teamDetailEditing, setTeamDetailEditing] = useState(false)
  const [savingTeam, setSavingTeam] = useState(false)
  const [memberPrivateSettings, setMemberPrivateSettings] =
    useState<TeamPrivateSettings | null>(null)
  const [loadingPrivateSettings, setLoadingPrivateSettings] = useState(false)
  const [editingCoord, setEditingCoord] = useState(false)
  const [draftWhatsapp, setDraftWhatsapp] = useState('')
  const [draftRules, setDraftRules] = useState('')
  const [savingCoord, setSavingCoord] = useState(false)
  const [challengeTeamPick, setChallengeTeamPick] = useState<
    Record<string, string>
  >({})

  const userTeams = getUserTeams()
  const myCaptainTeams = userTeams.filter((t) => t.captainId === currentUser?.id)
  const isTeamLimitReached = userTeams.length >= TEAM_USER_MAX_MEMBERSHIPS

  const discoverPool = useMemo(() => {
    if (!currentUser) return []
    return getFilteredTeams(currentUser.gender)
      .filter((t) => !userTeams.some((ut) => ut.id === t.id))
      .filter((t) => teamIsInPlayerGeo(currentUser, t))
  }, [currentUser, getFilteredTeams, userTeams])

  const discoverList = useMemo(
    () =>
      [...discoverPool].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      ),
    [discoverPool]
  )

  const ui = useMemo(
    () => ({
      statWinBg: theme.statWinBg,
      statDrawBg: theme.statDrawBg,
      statLossBg: theme.statLossBg,
      logoBoxBg: theme.logoBoxBg,
      logoBoxBorder: theme.logoBoxBorder,
      primaryAccent: theme.primaryAccent,
      dangerSurface: theme.dangerSurface,
      dangerOnSurface: theme.dangerOnSurface,
      accentOnSurface: theme.accentOnSurface,
    }),
    [theme]
  )

  const pendingInvites = teamInvites.filter(
    (inv) => inv.inviteeId === currentUser?.id && inv.status === 'pending'
  )
  const pendingJoinForCaptain = teamJoinRequests.filter(
    (r) =>
      r.status === 'pending' &&
      teams.some((t) => t.id === r.teamId && t.captainId === currentUser?.id)
  )

  const pendingJoinForTeam = (teamId: string) =>
    teamJoinRequests.filter((r) => r.teamId === teamId && r.status === 'pending')

  const myPendingJoinForTeam = (teamId: string) =>
    teamJoinRequests.find(
      (r) =>
        r.teamId === teamId &&
        r.requesterId === currentUser?.id &&
        r.status === 'pending'
    )

  const isMemberOfTeam = (team: Team) =>
    team.members.some((m) => m.id === currentUser?.id)

  const incomingRivalChallenges = rivalChallenges.filter((c) => {
    if (c.status !== 'pending') return false
    if (c.mode === 'direct') return c.challengedCaptainId === currentUser?.id
    return c.challengerCaptainId !== currentUser?.id && myCaptainTeams.length > 0
  })

  const detailTeam: Team | null =
    selectedTeam == null
      ? null
      : (teams.find((t) => t.id === selectedTeam.id) ?? selectedTeam)

  useEffect(() => {
    if (!teamsDetailFocusTeamId || !currentUser) return
    const t = teams.find((x) => x.id === teamsDetailFocusTeamId)
    if (t) {
      setSelectedTeam(t)
      setView('detail')
      setTeamsDetailFocusTeamId(null)
      return
    }
    if (teams.length > 0) {
      Alert.alert('Equipo', 'No encontramos ese equipo.')
      setTeamsDetailFocusTeamId(null)
    }
  }, [teamsDetailFocusTeamId, teams, currentUser, setTeamsDetailFocusTeamId])

  useEffect(() => {
    if (!selectedTeam || view !== 'detail') return
    setTeamDetailEditing(false)
  }, [selectedTeam?.id, view])

  useEffect(() => {
    if (!selectedTeam || view !== 'detail' || teamDetailEditing || !detailTeam)
      return
    setDraftTeamName(detailTeam.name)
    setDraftTeamDescription(detailTeam.description ?? '')
  }, [selectedTeam?.id, view, teamDetailEditing, detailTeam])

  useEffect(() => {
    if (view !== 'detail') setEditingCoord(false)
  }, [view])

  useEffect(() => {
    if (
      view !== 'detail' ||
      !detailTeam ||
      !currentUser ||
      !isMemberOfTeam(detailTeam) ||
      !isSupabaseConfigured()
    ) {
      setMemberPrivateSettings(null)
      setLoadingPrivateSettings(false)
      return
    }
    let cancelled = false
    setLoadingPrivateSettings(true)
    void (async () => {
      const supabase = getSupabase()
      const s = await fetchTeamPrivateSettings(supabase, detailTeam.id)
      if (!cancelled) {
        setMemberPrivateSettings(s)
        setLoadingPrivateSettings(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view, detailTeam?.id, currentUser?.id, teams])

  const openCoordEditor = () => {
    setDraftWhatsapp(memberPrivateSettings?.whatsappInviteUrl ?? '')
    setDraftRules(memberPrivateSettings?.rulesText ?? '')
    setEditingCoord(true)
  }

  const handleCreateTeam = async () => {
    if (!currentUser || !teamName.trim()) return
    if (isTeamLimitReached) {
      Alert.alert('Límite', `Máximo ${TEAM_USER_MAX_MEMBERSHIPS} equipos.`)
      return
    }
    const r = await createTeam({
      name: teamName.trim(),
      level: teamLevel,
      captainId: currentUser.id,
      members: [
        {
          id: currentUser.id,
          name: currentUser.name,
          position: currentUser.position,
          photo: currentUser.photo,
          status: 'confirmed',
        },
      ],
      city: currentUser.city,
      gender: currentUser.gender,
      description: teamDescription.trim() || undefined,
    })
    if (r.ok) {
      setTeamName('')
      setTeamLevel('intermedio')
      setTeamDescription('')
      setView('list')
    } else if (r.error) Alert.alert('No se pudo crear', r.error)
  }

  const handleSaveTeamProfile = async () => {
    if (!detailTeam || detailTeam.captainId !== currentUser?.id) return
    const name = draftTeamName.trim()
    const descTrim = draftTeamDescription.trim()
    const prevDesc = (detailTeam.description ?? '').trim()
    if (name.length < 2) {
      Alert.alert('Nombre', 'Al menos 2 caracteres.')
      return
    }
    if (name === detailTeam.name && descTrim === prevDesc) {
      setTeamDetailEditing(false)
      return
    }
    setSavingTeam(true)
    try {
      const r = await updateTeam(detailTeam.id, {
        name,
        description: descTrim.length > 0 ? descTrim : null,
      })
      if (r.ok) setTeamDetailEditing(false)
      else if (r.error) Alert.alert('Error', r.error)
    } finally {
      setSavingTeam(false)
    }
  }

  const pickLogo = async () => {
    if (!detailTeam || detailTeam.captainId !== currentUser?.id) return
    if (!isSupabaseConfigured()) {
      Alert.alert('Configura Supabase para subir el escudo.')
      return
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permiso', 'Necesitamos acceso a la galería.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    setSavingTeam(true)
    try {
      const supabase = getSupabase()
      const up = await uploadTeamLogoFromUri(
        supabase,
        detailTeam.id,
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
        asset.fileSize ?? null
      )
      if ('error' in up) {
        Alert.alert('Error', up.error)
        return
      }
      const r = await updateTeam(detailTeam.id, { logo: up.publicUrl })
      if (!r.ok && r.error) Alert.alert('Error', r.error)
    } finally {
      setSavingTeam(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!detailTeam || detailTeam.captainId !== currentUser?.id || !detailTeam.logo)
      return
    setSavingTeam(true)
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabase()
        await deleteTeamLogoFile(supabase, detailTeam.id)
      }
      const r = await updateTeam(detailTeam.id, { logo: null })
      if (!r.ok && r.error) Alert.alert('Error', r.error)
    } finally {
      setSavingTeam(false)
    }
  }

  const confirmDeleteTeam = () => {
    if (!detailTeam || detailTeam.captainId !== currentUser?.id) return
    Alert.alert(
      'Eliminar equipo',
      `¿Eliminar "${detailTeam.name}"? Se borrarán miembros, invitaciones y solicitudes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => void doDeleteTeam(),
        },
      ]
    )
  }

  const pickViceCaptain = (team: Team) => {
    const candidates = team.members.filter(
      (m) => m.id !== team.captainId && m.status === 'confirmed'
    )
    if (candidates.length === 0) {
      Alert.alert(
        'Vicecapitán',
        'No hay jugadores confirmados para designar como vicecapitán.'
      )
      return
    }
    Alert.alert(
      'Vicecapitán',
      'Elige quién ayudará a coordinar el equipo.',
      [
        {
          text: 'Sin vicecapitán',
          onPress: () => {
            void updateTeam(team.id, { viceCaptainId: null }).then((r) => {
              if (!r.ok && r.error) Alert.alert('Vicecapitán', r.error)
            })
          },
        },
        ...candidates.map((m) => ({
          text: m.name,
          onPress: () => {
            void updateTeam(team.id, { viceCaptainId: m.id }).then((r) => {
              if (!r.ok && r.error) Alert.alert('Vicecapitán', r.error)
            })
          },
        })),
        { text: 'Cancelar', style: 'cancel' as const },
      ]
    )
  }

  const goBackFromDetail = () => {
    setTeamDetailEditing(false)
    setEditingCoord(false)
    setSelectedTeam(null)
    setView('list')
  }

  const doDeleteTeam = async () => {
    if (!detailTeam) return
    try {
      if (detailTeam.logo && isSupabaseConfigured()) {
        const supabase = getSupabase()
        await deleteTeamLogoFile(supabase, detailTeam.id)
      }
    } catch {
      // ignore
    }
    const r = await deleteTeam(detailTeam.id)
    if (r.ok) {
      setSelectedTeam(null)
      setView('list')
    } else if (r.error) Alert.alert('Error', r.error)
  }

  const confirmLeaveTeam = () => {
    if (!detailTeam || !currentUser) return
    if (detailTeam.captainId === currentUser.id) return
    Alert.alert(
      'Salir del equipo',
      `¿Retirarte de "${detailTeam.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir', onPress: () => void doLeaveTeam() },
      ]
    )
  }

  const doLeaveTeam = async () => {
    if (!detailTeam) return
    const r = await leaveTeam(detailTeam.id)
    if (r.ok) {
      setSelectedTeam(null)
      setView('list')
    } else if (r.error) Alert.alert('Error', r.error)
  }

  const shareInviteLink = async (team: Team) => {
    const url = teamInviteAbsoluteUrl(team.id)
    try {
      await Share.share({
        message: `Únete a ${team.name} en SportMatch\n${url}`,
        title: team.name,
      })
    } catch {
      Alert.alert('Enlace', url)
    }
  }

  const whatsappInvite = (team: Team) => {
    const url = teamInviteAbsoluteUrl(team.id)
    const text = encodeURIComponent(
      `¡Te invito a unirte a ${team.name} en SportMatch! ${url}`
    )
    void Linking.openURL(`https://wa.me/?text=${text}`)
  }

  const availableUsers = currentUser
    ? getFilteredUsers(currentUser.gender).filter(
        (u) =>
          !selectedTeam?.members.some((m) => m.id === u.id) &&
          (searchQuery === '' ||
            u.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : []

  const renderMyTeamCard = (team: Team) => {
    const isCaptain = team.captainId === currentUser?.id
    const roster = rosterCountForDisplay(team)
    return (
      <Pressable
        key={team.id}
        style={[
          styles.myTeamCard,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
        onPress={() => {
          setSelectedTeam(team)
          setView('detail')
        }}
      >
        <View style={styles.cardRow}>
          <View
            style={[
              styles.logoBox,
              { backgroundColor: ui.logoBoxBg },
            ]}
          >
            {team.logo ? (
              <Image
                source={{ uri: team.logo }}
                style={styles.logoImg}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="shield" size={26} color={ui.primaryAccent} />
            )}
          </View>
          <View style={styles.cardMid}>
            <View style={styles.cardTitleRow}>
              <Text
                style={[styles.cardTitle, { color: theme.text }]}
                numberOfLines={1}
              >
                {team.name}
              </Text>
              {isCaptain ? (
                <Ionicons name="ribbon" size={16} color={theme.accent} />
              ) : null}
            </View>
            <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
              {LEVEL_LABELS[team.level]} · {roster}/{TEAM_ROSTER_MAX} jugadores
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </View>
      </Pressable>
    )
  }

  const renderDiscoverTeamCard = (team: Team, rankIndex: number | null) => {
    const isMember = userTeams.some((t) => t.id === team.id)
    const myJoin = myPendingJoinForTeam(team.id)
    const roster = rosterCountForDisplay(team)
    const canRequestJoin =
      !isMember &&
      team.gender === currentUser?.gender &&
      team.members.length < TEAM_ROSTER_MAX &&
      !myJoin
    const canChallenge = myCaptainTeams.length > 0
    const fogueo = teamRivalFogueo(team)
    const w = team.statsWins ?? 0
    const d = team.statsDraws ?? 0
    const l = team.statsLosses ?? 0

    return (
      <View
        key={team.id}
        style={[
          styles.discoverCard,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            shadowColor: theme.isDark ? '#000' : '#000',
          },
        ]}
      >
        <Pressable
          onPress={() => {
            setSelectedTeam(team)
            setView('detail')
          }}
          style={styles.discoverCardPressable}
        >
          <View style={styles.discoverTopRow}>
            {rankIndex != null ? (
              <View
                style={[
                  styles.rankBadge,
                  { backgroundColor: ui.logoBoxBg, borderColor: ui.logoBoxBorder },
                ]}
              >
                <Text style={[styles.rankBadgeText, { color: ui.primaryAccent }]}>
                  {rankIndex}
                </Text>
              </View>
            ) : null}
            <View
              style={[
                styles.logoBox,
                styles.discoverLogo,
                { backgroundColor: ui.logoBoxBg },
              ]}
            >
              {team.logo ? (
                <Image
                  source={{ uri: team.logo }}
                  style={styles.logoImg}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="shield" size={28} color={ui.primaryAccent} />
              )}
            </View>
            <View style={styles.cardMid}>
              <View style={styles.cardTitleRow}>
                <Text
                  style={[styles.cardTitle, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {team.name}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </View>
              <View style={styles.discoverBadgesRow}>
                <View
                  style={[
                    styles.levelPill,
                    {
                      backgroundColor: ui.logoBoxBg,
                      borderWidth: 1,
                      borderColor: ui.logoBoxBorder,
                    },
                  ]}
                >
                  <Text style={[styles.levelPillText, { color: ui.primaryAccent }]}>
                    {LEVEL_LABELS[team.level]}
                  </Text>
                </View>
                <Text style={[styles.rosterHint, { color: theme.textMuted }]}>
                  {roster}/{TEAM_ROSTER_MAX} jugadores
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.recordRow}>
            <View
              style={[
                styles.recordCell,
                { backgroundColor: ui.statWinBg },
              ]}
            >
              <Ionicons name="trophy" size={16} color={ui.primaryAccent} />
              <Text style={[styles.recordNum, { color: theme.text }]}>{w}</Text>
              <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                VICTORIAS
              </Text>
            </View>
            <View
              style={[
                styles.recordCell,
                { backgroundColor: ui.statDrawBg },
              ]}
            >
              <Ionicons name="remove-outline" size={18} color={ui.accentOnSurface} />
              <Text style={[styles.recordNum, { color: theme.text }]}>{d}</Text>
              <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                EMPATES
              </Text>
            </View>
            <View
              style={[
                styles.recordCell,
                { backgroundColor: ui.statLossBg },
              ]}
            >
              <Ionicons name="trending-down-outline" size={16} color={ui.dangerOnSurface} />
              <Text style={[styles.recordNum, { color: theme.text }]}>{l}</Text>
              <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                DERROTAS
              </Text>
            </View>
          </View>

          <View style={styles.fogueoBlock}>
            <View style={styles.fogueoTop}>
              <Ionicons name="flame-outline" size={18} color={theme.accent} />
              <Text
                style={[styles.fogueoSubtitle, { color: theme.textMuted, flex: 1 }]}
              >
                {fogueo.subtitle}
              </Text>
            </View>
            <View style={styles.fogueoBarRow}>
              <View
                style={[
                  styles.fogueoTrack,
                  {
                    backgroundColor: theme.skeleton,
                  },
                ]}
              >
                <View
                  style={[
                    styles.fogueoFill,
                    {
                      width: `${Math.round(fogueo.progress * 100)}%`,
                      backgroundColor: theme.primary,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.fogueoTier, { color: theme.text }]}
                numberOfLines={1}
              >
                {fogueo.tierLabel}
              </Text>
            </View>
          </View>

          {team.description ? (
            <Text style={[styles.discoverDesc, { color: theme.textMuted }]}>
              {team.description}
            </Text>
          ) : null}
        </Pressable>

        {!isMember ? (
          <View style={styles.discoverActions}>
            <Pressable
              style={[
                styles.btnJoinOutline,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.isDark ? 'transparent' : theme.card,
                },
                !canRequestJoin && styles.smallBtnOff,
              ]}
              disabled={!canRequestJoin}
              onPress={() =>
                void requestToJoinTeam(team.id).then((r) => {
                  if (!r.ok && r.error) Alert.alert('Solicitud', r.error)
                })
              }
            >
              <Ionicons name="hand-left-outline" size={18} color={theme.text} />
              <Text style={[styles.btnJoinOutlineText, { color: theme.text }]}>
                {myJoin ? 'Pendiente' : 'Solicitar unirme'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnChallenge,
                { backgroundColor: ui.dangerSurface },
                !canChallenge && styles.smallBtnOff,
              ]}
              disabled={!canChallenge}
              onPress={() => {
                if (!canChallenge) {
                  Alert.alert('Desafío', 'Necesitas ser capitán de un equipo.')
                  return
                }
                void saveRivalTargetTeamId(team.id)
                router.push('/crear')
              }}
            >
              <Ionicons name="shield-outline" size={18} color={ui.dangerOnSurface} />
              <Text style={[styles.btnChallengeText, { color: ui.dangerOnSurface }]}>
                Desafiar
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    )
  }

  const renderDiscoverListItem = useCallback(
    ({ item }: ListRenderItemInfo<Team>) =>
      renderDiscoverTeamCard(item, null),
    [renderDiscoverTeamCard]
  )

  const onRivalChallenge = async (c: RivalChallenge, accept: boolean) => {
    const myTeamId =
      c.mode === 'open' ? challengeTeamPick[c.id] : undefined
    const r = await respondToRivalChallenge(c.id, accept, myTeamId)
    if (!r.ok && r.error) Alert.alert('Desafío', r.error)
    if (r.ok && r.chatOpportunityId && accept) {
      router.push(`/partidos/chat/${r.chatOpportunityId}`)
    }
  }

  if (!currentUser || currentUser.accountType !== 'player') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Solo jugadores.</Text>
      </View>
    )
  }

  if (view === 'create') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollPad}>
          <Pressable onPress={() => setView('list')} style={styles.backRow}>
            <Text style={styles.backLink}>← Volver</Text>
          </Pressable>
          <Text style={styles.h1}>Crear equipo</Text>
          {isTeamLimitReached ? (
            <Text style={styles.warn}>
              Límite alcanzado ({userTeams.length}/{TEAM_USER_MAX_MEMBERSHIPS}). Sal de
              un equipo para crear otro.
            </Text>
          ) : null}
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={teamName}
            onChangeText={setTeamName}
            placeholder="Ej: Los Cracks FC"
            placeholderTextColor={theme.textMuted}
          />
          <Text style={styles.label}>Nivel</Text>
          <View style={styles.levelGrid}>
            {(Object.keys(LEVEL_LABELS) as Level[]).map((lv) => (
              <Pressable
                key={lv}
                style={[
                  styles.levelCell,
                  teamLevel === lv && styles.levelCellOn,
                ]}
                onPress={() => setTeamLevel(lv)}
              >
                <Text
                  style={[
                    styles.levelCellText,
                    teamLevel === lv && styles.levelCellTextOn,
                  ]}
                >
                  {LEVEL_LABELS[lv]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Descripción (opcional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={teamDescription}
            onChangeText={setTeamDescription}
            placeholder="Descripción breve"
            placeholderTextColor={theme.textMuted}
            multiline
          />
          <Pressable
            style={[styles.primaryBtn, (!teamName.trim() || isTeamLimitReached) && styles.btnDisabled]}
            disabled={!teamName.trim() || isTeamLimitReached}
            onPress={() => void handleCreateTeam()}
          >
            <Text style={styles.primaryBtnText}>Crear equipo</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (view === 'invite' && selectedTeam) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollPad}>
          <Pressable onPress={() => setView('detail')} style={styles.backRow}>
            <Text style={styles.backLink}>← Volver</Text>
          </Pressable>
          <Text style={styles.h1}>Invitar jugadores</Text>
          <Text style={styles.sub}>A {selectedTeam.name}</Text>
          <TextInput
            style={styles.input}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar…"
            placeholderTextColor={theme.textMuted}
          />
          {availableUsers.map((user) => {
            const alreadyInvited = teamInvites.some(
              (inv) =>
                inv.teamId === selectedTeam.id &&
                inv.inviteeId === user.id &&
                inv.status === 'pending'
            )
            return (
              <View key={user.id} style={styles.inviteRow}>
                <Image
                  source={{ uri: user.photo }}
                  style={styles.avatar}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteName}>{user.name}</Text>
                  <Text style={styles.inviteMeta}>
                    {positionLabel(user.position)} · {LEVEL_LABELS[user.level]}
                  </Text>
                </View>
                <Pressable
                  style={[styles.smallBtn, alreadyInvited && styles.smallBtnOff]}
                  disabled={alreadyInvited}
                  onPress={() =>
                    void inviteToTeam(selectedTeam.id, user.id).then((r) => {
                      if (!r.ok && r.error) Alert.alert('Invitación', r.error)
                    })
                  }
                >
                  <Text style={styles.smallBtnText}>
                    {alreadyInvited ? 'Invitado' : 'Invitar'}
                  </Text>
                </Pressable>
              </View>
            )
          })}
          {availableUsers.length === 0 ? (
            <Text style={styles.muted}>No hay jugadores para invitar.</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (view === 'detail' && detailTeam) {
    const team = detailTeam
    const isCaptain = team.captainId === currentUser.id
    const viceMember = team.viceCaptainId
      ? team.members.find(
          (m) => m.id === team.viceCaptainId && m.status === 'confirmed'
        ) ?? null
      : null
    const isMember = isMemberOfTeam(team)
    const myJoin = myPendingJoinForTeam(team.id)
    const incomingJoin = pendingJoinForTeam(team.id)
    const slotsAvailable = TEAM_ROSTER_MAX - team.members.length
    const roster = rosterCountForDisplay(team)
    const fogueo = teamRivalFogueo(team)
    const wins = team.statsWins ?? 0
    const draws = team.statsDraws ?? 0
    const losses = team.statsLosses ?? 0
    const rivalTotal = wins + draws + losses
    const winStreak = team.statsWinStreak ?? 0
    const captainMember = team.members.find((m) => m.id === team.captainId)
    const showCaptainLayout = isCaptain && !teamDetailEditing
    const ruleLines = parseRulesLines(memberPrivateSettings?.rulesText)
    const canRequestJoin =
      !isCaptain &&
      !isMember &&
      team.gender === currentUser.gender &&
      slotsAvailable > 0 &&
      !myJoin

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollPad}>
          {isCaptain && teamDetailEditing ? (
            <>
              <Pressable onPress={goBackFromDetail} style={styles.backRow}>
                <Ionicons name="arrow-back" size={18} color={theme.primary} />
                <Text style={styles.backLink}>Volver</Text>
              </Pressable>
              <View
                style={[
                  styles.detailHeroCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Pressable onPress={() => void pickLogo()}>
                  <View style={[styles.detailLogo, { backgroundColor: ui.logoBoxBg }]}>
                    {team.logo ? (
                      <Image
                        source={{ uri: team.logo }}
                        style={styles.detailLogoImg}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name="shield" size={44} color={ui.primaryAccent} />
                    )}
                    {savingTeam ? (
                      <View style={styles.logoOverlay}>
                        <ActivityIndicator color={theme.primaryBtnText} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
                <View style={styles.detailHeroBody}>
                  <TextInput
                    style={styles.input}
                    value={draftTeamName}
                    onChangeText={setDraftTeamName}
                    maxLength={80}
                  />
                  <TextInput
                    style={[styles.input, styles.inputMultiline, { marginTop: 8 }]}
                    value={draftTeamDescription}
                    onChangeText={setDraftTeamDescription}
                    placeholder="Descripción"
                    maxLength={500}
                    multiline
                  />
                  <View style={styles.rowActions}>
                    <Pressable
                      style={styles.primaryBtnSm}
                      onPress={() => void handleSaveTeamProfile()}
                      disabled={savingTeam}
                    >
                      <Text style={styles.primaryBtnText}>Guardar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.outlineBtnSm}
                      onPress={() => {
                        setDraftTeamName(team.name)
                        setDraftTeamDescription(team.description ?? '')
                        setTeamDetailEditing(false)
                      }}
                    >
                      <Text style={styles.outlineBtnSmText}>Cancelar</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </>
          ) : showCaptainLayout ? (
            <>
              <View style={styles.captainTopBar}>
                <Pressable onPress={goBackFromDetail} style={styles.backRow}>
                  <Ionicons name="arrow-back" size={18} color={theme.primary} />
                  <Text style={styles.backLink}>Volver</Text>
                </Pressable>
                <Pressable
                  style={[styles.captainDeleteBtn, { backgroundColor: theme.danger }]}
                  onPress={confirmDeleteTeam}
                >
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                  <Text style={styles.captainDeleteText}>Eliminar</Text>
                </Pressable>
              </View>

              <View
                style={[
                  styles.captainHeroCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Pressable onPress={() => void pickLogo()}>
                  <View style={[styles.captainLogoBox, { backgroundColor: ui.logoBoxBg }]}>
                    {team.logo ? (
                      <Image
                        source={{ uri: team.logo }}
                        style={styles.captainLogoImg}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name="shield" size={36} color={ui.primaryAccent} />
                    )}
                    {savingTeam ? (
                      <View style={styles.logoOverlay}>
                        <ActivityIndicator color={theme.primaryBtnText} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
                <View style={styles.captainHeroInfo}>
                  <Text style={[styles.captainHeroName, { color: theme.text }]} numberOfLines={2}>
                    {team.name}
                  </Text>
                  <View style={styles.captainPillsRow}>
                    <View style={[styles.levelPill, { backgroundColor: ui.logoBoxBg }]}>
                      <Text style={[styles.levelPillText, { color: ui.primaryAccent }]}>
                        {LEVEL_LABELS[team.level]}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.levelPill,
                        styles.detailCityPillWrap,
                        { backgroundColor: theme.skeleton },
                      ]}
                    >
                      <Ionicons name="location-outline" size={12} color={theme.textMuted} />
                      <Text style={[styles.detailCityPill, { color: theme.textMuted }]}>
                        {team.city}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.captainBadgePill,
                        { backgroundColor: theme.isDark ? 'rgba(234,179,8,0.18)' : '#FEF3C7' },
                      ]}
                    >
                      <Ionicons name="ribbon" size={12} color="#CA8A04" />
                      <Text style={styles.captainBadgePillText}>Capitán</Text>
                    </View>
                  </View>
                  <View style={styles.captainHeroActions}>
                    {team.logo ? (
                      <Pressable
                        onPress={() => void handleRemoveLogo()}
                        disabled={savingTeam}
                      >
                        <Text style={styles.dangerLink}>Quitar escudo</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => setTeamDetailEditing(true)}>
                      <Text style={styles.link}>Editar</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {team.description ? (
                <View
                  style={[
                    styles.captainDescCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.captainDescText, { color: theme.textMuted }]}>
                    {team.description}
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.detailStatsCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.detailSectionLabel, { color: theme.textMuted }]}>
                  ESTADÍSTICAS DEL EQUIPO
                </Text>
                <View style={[styles.recordRow, { marginTop: 0 }]}>
                  <View style={[styles.recordCell, { backgroundColor: ui.statWinBg }]}>
                    <Ionicons name="trophy" size={18} color={ui.primaryAccent} />
                    <Text style={[styles.recordNum, { color: theme.text }]}>{wins}</Text>
                    <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                      VICTORIAS
                    </Text>
                  </View>
                  <View style={[styles.recordCell, { backgroundColor: ui.statDrawBg }]}>
                    <Ionicons name="remove-outline" size={18} color={ui.accentOnSurface} />
                    <Text style={[styles.recordNum, { color: theme.text }]}>{draws}</Text>
                    <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                      EMPATES
                    </Text>
                  </View>
                  <View style={[styles.recordCell, { backgroundColor: ui.statLossBg }]}>
                    <Ionicons name="trending-down-outline" size={16} color={ui.dangerOnSurface} />
                    <Text style={[styles.recordNum, { color: theme.text }]}>{losses}</Text>
                    <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                      DERROTAS
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.captainImpulseCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <View style={styles.captainImpulseTop}>
                  <View
                    style={[
                      styles.captainImpulseIcon,
                      { backgroundColor: theme.isDark ? 'rgba(234,179,8,0.2)' : '#FFEDD5' },
                    ]}
                  >
                    <Ionicons name="flame" size={20} color="#EA580C" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.captainImpulseTier, { color: theme.text }]}>
                      {fogueo.tierLabel}
                    </Text>
                    <Text style={[styles.captainImpulseSub, { color: theme.textMuted }]}>
                      {fogueo.subtitle}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.captainImpulseLabel, { color: theme.textMuted }]}>
                  PROGRESO DE IMPULSO
                </Text>
                <View style={styles.captainImpulseBarRow}>
                  <View
                    style={[styles.fogueoTrack, { backgroundColor: theme.skeleton, flex: 1 }]}
                  >
                    <View
                      style={[
                        styles.fogueoFill,
                        {
                          width: `${Math.round(fogueo.progress * 100)}%`,
                          backgroundColor: theme.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.captainImpulsePct, { color: theme.text }]}>
                    {Math.round(fogueo.progress * 100)}%
                  </Text>
                </View>
                <View style={styles.captainImpulseStats}>
                  <View
                    style={[
                      styles.captainImpulseStat,
                      { backgroundColor: theme.skeleton },
                    ]}
                  >
                    <Text style={[styles.captainImpulseStatLabel, { color: theme.textMuted }]}>
                      Partidos rival jugados
                    </Text>
                    <Text style={[styles.captainImpulseStatVal, { color: theme.text }]}>
                      {rivalTotal}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.captainImpulseStat,
                      { backgroundColor: theme.skeleton },
                    ]}
                  >
                    <Text style={[styles.captainImpulseStatLabel, { color: theme.textMuted }]}>
                      Racha de victorias
                    </Text>
                    <Text style={[styles.captainImpulseStatVal, { color: theme.text }]}>
                      {winStreak}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.captainImpulseFoot, { color: theme.textMuted }]}>
                  El nivel de impulso se calcula con victorias, empates, derrotas y rachas en
                  partidos rival.
                </Text>
              </View>

              {incomingJoin.length > 0 ? (
                <View style={[styles.joinBox, { borderColor: theme.border }]}>
                  <Text style={styles.joinTitle}>
                    Solicitudes ({incomingJoin.length})
                  </Text>
                  {incomingJoin.map((r: TeamJoinRequest) => (
                    <View key={r.id} style={styles.joinRow}>
                      <TeamMemberAvatar photo={r.requesterPhoto} name={r.requesterName} />
                      <Text style={styles.inviteName} numberOfLines={1}>
                        {r.requesterName}
                      </Text>
                      <Pressable
                        style={styles.outlineBtnSm}
                        onPress={() =>
                          void respondToJoinRequest(r.id, false).then((res) => {
                            if (!res.ok && res.error) Alert.alert('Error', res.error)
                          })
                        }
                      >
                        <Text style={styles.outlineBtnSmText}>No</Text>
                      </Pressable>
                      <Pressable
                        style={styles.primaryBtnSm}
                        onPress={() =>
                          void respondToJoinRequest(r.id, true).then((res) => {
                            if (!res.ok && res.error) Alert.alert('Error', res.error)
                          })
                        }
                      >
                        <Text style={styles.primaryBtnText}>Sí</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <View
                style={[
                  styles.captainSectionCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.captainSectionTitle, { color: theme.text }]}>
                  Vicecapitán
                </Text>
                <Pressable
                  style={[
                    styles.captainVicePicker,
                    { borderColor: theme.border, backgroundColor: theme.bg },
                  ]}
                  onPress={() => pickViceCaptain(team)}
                >
                  {viceMember ? (
                    <TeamMemberAvatar photo={viceMember.photo} name={viceMember.name} size={36} />
                  ) : (
                    <View
                      style={[
                        styles.captainVicePlaceholder,
                        { backgroundColor: theme.skeleton },
                      ]}
                    >
                      <Ionicons name="person-add-outline" size={18} color={theme.textMuted} />
                    </View>
                  )}
                  <Text
                    style={[styles.captainViceName, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {viceMember?.name ?? 'Designar vicecapitán'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
                </Pressable>
              </View>

              {loadingPrivateSettings ? (
                <ActivityIndicator style={{ marginVertical: 12 }} />
              ) : editingCoord ? (
                <View
                  style={[
                    styles.captainSectionCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.captainSectionTitle, { color: theme.text }]}>
                    Grupo de WhatsApp
                  </Text>
                  <Text style={styles.label}>Enlace del grupo</Text>
                  <TextInput
                    style={styles.input}
                    value={draftWhatsapp}
                    onChangeText={setDraftWhatsapp}
                    placeholder="https://chat.whatsapp.com/..."
                    autoCapitalize="none"
                  />
                  <Text style={[styles.label, { marginTop: 12 }]}>Reglas del equipo</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={draftRules}
                    onChangeText={setDraftRules}
                    multiline
                    maxLength={4000}
                    placeholder="Una regla por línea"
                  />
                  <View style={styles.rowActions}>
                    <Pressable
                      style={styles.outlineBtnSm}
                      onPress={() => {
                        setDraftWhatsapp(memberPrivateSettings?.whatsappInviteUrl ?? '')
                        setDraftRules(memberPrivateSettings?.rulesText ?? '')
                        setEditingCoord(false)
                      }}
                    >
                      <Text style={styles.outlineBtnSmText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryBtnSm}
                      disabled={savingCoord}
                      onPress={() => void (async () => {
                        setSavingCoord(true)
                        try {
                          const res = await updateTeamPrivateSettings(team.id, {
                            whatsappInviteUrl: draftWhatsapp,
                            rulesText: draftRules,
                          })
                          if (res) setMemberPrivateSettings(res)
                          setEditingCoord(false)
                        } finally {
                          setSavingCoord(false)
                        }
                      })()}
                    >
                      <Text style={styles.primaryBtnText}>Guardar</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.captainWaCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.captainWaHead}>
                    <View style={styles.captainWaIconWrap}>
                      <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.captainWaTitle, { color: theme.text }]}>
                        Grupo de WhatsApp
                      </Text>
                      <Text style={[styles.captainWaSub, { color: theme.textMuted }]}>
                        Coordinación y avisos entre jugadores
                      </Text>
                    </View>
                  </View>
                  <View style={styles.captainWaActions}>
                    {memberPrivateSettings?.whatsappInviteUrl ? (
                      <Pressable
                        style={styles.captainWaJoinBtn}
                        onPress={() =>
                          void Linking.openURL(memberPrivateSettings.whatsappInviteUrl!)
                        }
                      >
                        <Text style={styles.captainWaJoinText}>Unirse al grupo</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[
                        styles.captainWaEditBtn,
                        { borderColor: theme.border },
                      ]}
                      onPress={openCoordEditor}
                    >
                      <Text style={[styles.captainWaEditText, { color: theme.text }]}>
                        Editar enlace y reglas
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {!editingCoord && ruleLines.length > 0 ? (
                <TeamRulesList
                  rules={ruleLines}
                  theme={theme}
                  ui={ui}
                  styles={styles}
                />
              ) : null}

              <View style={styles.captainMetricsRow}>
                <View
                  style={[
                    styles.captainMetricCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.captainMetricNum, { color: theme.primary }]}>
                    {roster}
                  </Text>
                  <Text style={[styles.captainMetricLabel, { color: theme.textMuted }]}>
                    JUGADORES
                  </Text>
                </View>
                <View
                  style={[
                    styles.captainMetricCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.captainMetricNum,
                      { color: slotsAvailable > 0 ? '#EA580C' : theme.textMuted },
                    ]}
                  >
                    {slotsAvailable}
                  </Text>
                  <Text style={[styles.captainMetricLabel, { color: theme.textMuted }]}>
                    CUPOS
                  </Text>
                </View>
              </View>

              <View style={styles.captainPlantillaHead}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                  Plantilla
                </Text>
                <Pressable
                  style={[styles.captainInvitePill, { backgroundColor: theme.primary }]}
                  onPress={() => setView('invite')}
                >
                  <Ionicons name="person-add-outline" size={16} color={theme.primaryBtnText} />
                  <Text style={styles.captainInvitePillText}>Invitar</Text>
                </Pressable>
              </View>

              {team.members.map((member) => {
                const isCap = team.captainId === member.id
                const isVice = viceMember?.id === member.id
                const isActive = member.status === 'confirmed'
                return (
                  <View
                    key={member.id}
                    style={[
                      styles.captainMemberRow,
                      { backgroundColor: theme.card, borderColor: theme.border },
                    ]}
                  >
                    <TeamMemberAvatar photo={member.photo} name={member.name} />
                    <View style={styles.detailMemberBody}>
                      <View style={styles.captainMemberNameRow}>
                        <Text style={[styles.inviteName, { color: theme.text }]}>
                          {member.name}
                        </Text>
                        {isCap ? (
                          <View
                            style={[
                              styles.captainRoleBadge,
                              { backgroundColor: theme.isDark ? 'rgba(234,179,8,0.18)' : '#FEF3C7' },
                            ]}
                          >
                            <Text style={styles.captainRoleBadgeText}>Capitán</Text>
                          </View>
                        ) : isVice ? (
                          <View
                            style={[
                              styles.captainRoleBadge,
                              { backgroundColor: ui.logoBoxBg },
                            ]}
                          >
                            <Text
                              style={[styles.captainRoleBadgeText, { color: theme.primary }]}
                            >
                              2º cap.
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.inviteMeta, { color: theme.textMuted }]}>
                        {positionLabel(member.position)}
                      </Text>
                    </View>
                    {isActive ? (
                      <View style={styles.captainActiveWrap}>
                        <View style={[styles.captainActiveDot, { backgroundColor: theme.primary }]} />
                        <Text style={[styles.captainActiveText, { color: theme.primary }]}>
                          Activo
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.captainPendingText, { color: theme.accent }]}>
                        Pendiente
                      </Text>
                    )}
                  </View>
                )
              })}

              {slotsAvailable > 0 ? (
                <View
                  style={[
                    styles.emptySlotsCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.emptySlotsHeader}>
                    <View
                      style={[
                        styles.emptySlotsIcon,
                        { backgroundColor: theme.skeleton },
                      ]}
                    >
                      <Ionicons name="people-outline" size={22} color={theme.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.emptySlotsTitle, { color: theme.text }]}>
                        {slotsAvailable}{' '}
                        {slotsAvailable === 1 ? 'cupo disponible' : 'cupos disponibles'}
                      </Text>
                      <Text style={[styles.emptySlotsSub, { color: theme.textMuted }]}>
                        Invita compañeros para completar la plantilla
                      </Text>
                    </View>
                  </View>
                  <View style={styles.emptySlotsActions}>
                    <Pressable
                      style={[styles.emptySlotAction, { borderColor: theme.border }]}
                      onPress={() => setView('invite')}
                    >
                      <Ionicons name="person-add" size={16} color={theme.primary} />
                      <Text style={[styles.emptySlotActionText, { color: theme.primary }]}>
                        Invitar
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.emptySlotAction, { borderColor: theme.border }]}
                      onPress={() => void shareInviteLink(team)}
                    >
                      <Ionicons name="share-outline" size={16} color={theme.text} />
                      <Text style={[styles.emptySlotActionText, { color: theme.text }]}>
                        Compartir
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.emptySlotAction, { borderColor: theme.border }]}
                      onPress={() => whatsappInvite(team)}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      <Text style={[styles.emptySlotActionText, { color: theme.text }]}>
                        WhatsApp
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          ) : (
            <>
          <Pressable
            onPress={goBackFromDetail}
            style={styles.backRow}
          >
            <Ionicons name="arrow-back" size={18} color={theme.primary} />
            <Text style={styles.backLink}>Volver</Text>
          </Pressable>

          {/* Hero */}
          <View
            style={[
              styles.detailHeroCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Pressable onPress={isCaptain ? () => void pickLogo() : undefined}>
              <View style={[styles.detailLogo, { backgroundColor: ui.logoBoxBg }]}>
                {team.logo ? (
                  <Image
                    source={{ uri: team.logo }}
                    style={styles.detailLogoImg}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons name="shield" size={44} color={ui.primaryAccent} />
                )}
                {isCaptain && savingTeam ? (
                  <View style={styles.logoOverlay}>
                    <ActivityIndicator color={theme.primaryBtnText} />
                  </View>
                ) : null}
              </View>
            </Pressable>

            <View style={styles.detailHeroBody}>
                <Text style={styles.detailHeroName} numberOfLines={2}>
                  {team.name}
                </Text>
                <View style={styles.detailHeroPills}>
                  <View style={[styles.levelPill, { backgroundColor: ui.logoBoxBg }]}>
                    <Text style={[styles.levelPillText, { color: ui.primaryAccent }]}>
                      {LEVEL_LABELS[team.level]}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.levelPill,
                      styles.detailCityPillWrap,
                      { backgroundColor: theme.skeleton },
                    ]}
                  >
                    <Ionicons name="location-outline" size={12} color={theme.textMuted} />
                    <Text style={[styles.detailCityPill, { color: theme.textMuted }]}>
                      {team.city}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.detailRosterHint, { color: theme.textMuted }]}>
                  {roster}/{TEAM_ROSTER_MAX} jugadores · {slotsAvailable} cupos libres
                </Text>
                <View style={styles.detailTitleRow}>
                  {isCaptain ? (
                    <View style={styles.capActions}>
                      <Pressable onPress={() => setTeamDetailEditing(true)}>
                        <Text style={styles.link}>Editar</Text>
                      </Pressable>
                      <Pressable onPress={confirmDeleteTeam}>
                        <Text style={styles.dangerLink}>Eliminar</Text>
                      </Pressable>
                    </View>
                  ) : isMember ? (
                    <Pressable onPress={confirmLeaveTeam}>
                      <Text style={styles.link}>Salir del equipo</Text>
                    </Pressable>
                  ) : null}
                  {isCaptain && team.logo ? (
                    <Pressable onPress={() => void handleRemoveLogo()} disabled={savingTeam}>
                      <Text style={styles.dangerLink}>Quitar escudo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
          </View>

          {!teamDetailEditing && team.description ? (
            <Text style={[styles.detailDescription, { color: theme.textMuted }]}>
              {team.description}
            </Text>
          ) : null}

          {!teamDetailEditing ? (
            <View
              style={[
                styles.detailStatsCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.detailSectionLabel, { color: theme.textMuted }]}>
                ESTADÍSTICAS DEL EQUIPO
              </Text>
              <View style={[styles.recordRow, { marginTop: 0 }]}>
                <View style={[styles.recordCell, { backgroundColor: ui.statWinBg }]}>
                  <Ionicons name="trophy" size={18} color={theme.primary} />
                  <Text style={[styles.recordNum, { color: theme.text }]}>{wins}</Text>
                  <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                    VICTORIAS
                  </Text>
                </View>
                <View style={[styles.recordCell, { backgroundColor: ui.statDrawBg }]}>
                  <Ionicons name="remove-outline" size={18} color={ui.accentOnSurface} />
                  <Text style={[styles.recordNum, { color: theme.text }]}>{draws}</Text>
                  <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                    EMPATES
                  </Text>
                </View>
                <View style={[styles.recordCell, { backgroundColor: ui.statLossBg }]}>
                  <Ionicons name="trending-down-outline" size={16} color={ui.dangerOnSurface} />
                  <Text style={[styles.recordNum, { color: theme.text }]}>{losses}</Text>
                  <Text style={[styles.recordLabel, { color: theme.textMuted }]}>
                    DERROTAS
                  </Text>
                </View>
              </View>
              <View style={styles.fogueoBlock}>
                <View style={styles.fogueoTop}>
                  <Ionicons name="flame-outline" size={18} color={theme.accent} />
                  <Text
                    style={[styles.fogueoSubtitle, { color: theme.textMuted, flex: 1 }]}
                  >
                    {fogueo.subtitle}
                  </Text>
                </View>
                <View style={styles.fogueoBarRow}>
                  <View
                    style={[styles.fogueoTrack, { backgroundColor: theme.skeleton }]}
                  >
                    <View
                      style={[
                        styles.fogueoFill,
                        {
                          width: `${Math.round(fogueo.progress * 100)}%`,
                          backgroundColor: theme.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.fogueoTier, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {fogueo.tierLabel}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {isCaptain && incomingJoin.length > 0 && !teamDetailEditing ? (
            <View style={[styles.joinBox, { borderColor: theme.border }]}>
              <Text style={styles.joinTitle}>
                Solicitudes ({incomingJoin.length})
              </Text>
              {incomingJoin.map((r: TeamJoinRequest) => (
                <View key={r.id} style={styles.joinRow}>
                  <Image
                    source={{ uri: r.requesterPhoto }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                  <Text style={styles.inviteName} numberOfLines={1}>
                    {r.requesterName}
                  </Text>
                  <Pressable
                    style={styles.outlineBtnSm}
                    onPress={() =>
                      void respondToJoinRequest(r.id, false).then((res) => {
                        if (!res.ok && res.error) Alert.alert('Error', res.error)
                      })
                    }
                  >
                    <Text style={styles.outlineBtnSmText}>No</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtnSm}
                    onPress={() =>
                      void respondToJoinRequest(r.id, true).then((res) => {
                        if (!res.ok && res.error) Alert.alert('Error', res.error)
                      })
                    }
                  >
                    <Text style={styles.primaryBtnText}>Sí</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {!teamDetailEditing && !isCaptain && !isMember && team.gender === currentUser.gender ? (
            <View
              style={[
                styles.detailJoinBanner,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.detailJoinBannerText, { color: theme.text }]}>
                ¿Quieres formar parte de este equipo?
              </Text>
              {slotsAvailable === 0 ? (
                <Text style={[styles.muted, { marginTop: 8 }]}>Plantilla completa.</Text>
              ) : myJoin ? (
                <View style={[styles.joinRow, { marginTop: 10 }]}>
                  <Text style={styles.bodyText}>Solicitud pendiente.</Text>
                  <Pressable
                    style={styles.outlineBtnSm}
                    onPress={() =>
                      void cancelJoinRequest(myJoin.id).then((res) => {
                        if (!res.ok && res.error) Alert.alert('Error', res.error)
                      })
                    }
                  >
                    <Text style={styles.outlineBtnSmText}>Cancelar</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[
                    styles.detailJoinBtn,
                    { backgroundColor: theme.primary },
                    !canRequestJoin && styles.smallBtnOff,
                  ]}
                  disabled={!canRequestJoin}
                  onPress={() =>
                    void requestToJoinTeam(team.id).then((res) => {
                      if (!res.ok && res.error) Alert.alert('Solicitud', res.error)
                    })
                  }
                >
                  <Ionicons name="person-add-outline" size={18} color={theme.primaryBtnText} />
                  <Text style={styles.primaryBtnText}>Solicitar unirse</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {isMember ? (
            <View style={styles.coordSection}>
              {loadingPrivateSettings ? (
                <ActivityIndicator />
              ) : editingCoord && isCaptain ? (
                <>
                  <Text style={styles.label}>WhatsApp (grupo)</Text>
                  <TextInput
                    style={styles.input}
                    value={draftWhatsapp}
                    onChangeText={setDraftWhatsapp}
                    placeholder="https://chat.whatsapp.com/..."
                    autoCapitalize="none"
                  />
                  <Text style={styles.label}>Reglas</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={draftRules}
                    onChangeText={setDraftRules}
                    multiline
                    maxLength={4000}
                  />
                  <View style={styles.rowActions}>
                    <Pressable
                      style={styles.outlineBtnSm}
                      onPress={() => {
                        setDraftWhatsapp(
                          memberPrivateSettings?.whatsappInviteUrl ?? ''
                        )
                        setDraftRules(memberPrivateSettings?.rulesText ?? '')
                        setEditingCoord(false)
                      }}
                    >
                      <Text style={styles.outlineBtnSmText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryBtnSm}
                      disabled={savingCoord}
                      onPress={() => void (async () => {
                        setSavingCoord(true)
                        try {
                          const res = await updateTeamPrivateSettings(team.id, {
                            whatsappInviteUrl: draftWhatsapp,
                            rulesText: draftRules,
                          })
                          if (res) setMemberPrivateSettings(res)
                          setEditingCoord(false)
                        } finally {
                          setSavingCoord(false)
                        }
                      })()}
                    >
                      <Text style={styles.primaryBtnText}>Guardar</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  {memberPrivateSettings?.whatsappInviteUrl ? (
                    <Pressable
                      style={styles.waBtn}
                      onPress={() =>
                        void Linking.openURL(
                          memberPrivateSettings.whatsappInviteUrl!
                        )
                      }
                    >
                      <Text style={styles.waBtnText}>Abrir WhatsApp del grupo</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.muted}>
                      {isCaptain
                        ? 'Añade el enlace del grupo WhatsApp.'
                        : 'El capitán aún no compartió el enlace.'}
                    </Text>
                  )}
                  {isCaptain ? (
                    <Pressable onPress={openCoordEditor}>
                      <Text style={styles.link}>Editar enlace y reglas</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {!teamDetailEditing && isMember && !showCaptainLayout && ruleLines.length > 0 ? (
            <TeamRulesList
              rules={ruleLines}
              theme={theme}
              ui={ui}
              styles={styles}
            />
          ) : null}

          {!teamDetailEditing ? (
            <>
              <View style={styles.detailLeadershipRow}>
                <View
                  style={[
                    styles.detailLeadCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Ionicons name="ribbon-outline" size={16} color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailLeadLabel, { color: theme.textMuted }]}>
                      Capitán
                    </Text>
                    <Text style={[styles.detailLeadName, { color: theme.text }]}>
                      {captainMember?.name ?? 'Sin dato'}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.detailLeadCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Ionicons name="shield-checkmark-outline" size={16} color={ui.primaryAccent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailLeadLabel, { color: theme.textMuted }]}>
                      Vice
                    </Text>
                    <Text style={[styles.detailLeadName, { color: theme.text }]}>
                      {viceMember?.name ?? 'Por definir'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.detailPlantillaHead}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                  Plantilla
                </Text>
                <Text style={[styles.detailPlantillaCount, { color: theme.textMuted }]}>
                  {roster} activos
                </Text>
              </View>

              {isCaptain && slotsAvailable > 0 ? (
                <Pressable
                  style={[styles.detailInviteBtn, { borderColor: theme.primary }]}
                  onPress={() => setView('invite')}
                >
                  <Ionicons name="person-add-outline" size={18} color={theme.primary} />
                  <Text style={[styles.detailInviteBtnText, { color: theme.primary }]}>
                    Invitar jugadores
                  </Text>
                </Pressable>
              ) : null}

              {team.members.map((member) => {
                const isCap = team.captainId === member.id
                const isVice = viceMember?.id === member.id
                const roleLabel = isCap
                  ? 'Capitán'
                  : isVice
                    ? 'Vice'
                    : member.status === 'confirmed'
                      ? 'Activo'
                      : 'Pendiente'
                const statusTone =
                  member.status === 'confirmed'
                    ? theme.primary
                    : theme.accent
                return (
                  <View
                    key={member.id}
                    style={[
                      styles.detailMemberCard,
                      { backgroundColor: theme.card, borderColor: theme.border },
                    ]}
                  >
                    <Image
                      source={{ uri: member.photo }}
                      style={styles.avatar}
                      contentFit="cover"
                    />
                    <View style={styles.detailMemberBody}>
                      <Text style={[styles.inviteName, { color: theme.text }]}>
                        {member.name}
                      </Text>
                      <Text style={[styles.inviteMeta, { color: theme.textMuted }]}>
                        {positionLabel(member.position)}
                        {isCap || isVice ? ` · ${roleLabel}` : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.detailStatusPill,
                        {
                          backgroundColor:
                            member.status === 'confirmed'
                              ? ui.statWinBg
                              : ui.statDrawBg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.detailStatusPillText,
                          { color: statusTone },
                        ]}
                      >
                        {roleLabel}
                      </Text>
                    </View>
                  </View>
                )
              })}

              {slotsAvailable > 0 ? (
                <View
                  style={[
                    styles.emptySlotsCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.emptySlotsHeader}>
                    <View
                      style={[
                        styles.emptySlotsIcon,
                        { backgroundColor: theme.skeleton },
                      ]}
                    >
                      <Ionicons name="people-outline" size={22} color={theme.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.emptySlotsTitle, { color: theme.text }]}>
                        {slotsAvailable}{' '}
                        {slotsAvailable === 1 ? 'cupo disponible' : 'cupos disponibles'}
                      </Text>
                      <Text style={[styles.emptySlotsSub, { color: theme.textMuted }]}>
                        Invita compañeros para completar la plantilla
                      </Text>
                    </View>
                  </View>
                  {isCaptain ? (
                    <View style={styles.emptySlotsActions}>
                      <Pressable
                        style={[styles.emptySlotAction, { borderColor: theme.border }]}
                        onPress={() => setView('invite')}
                      >
                        <Ionicons name="person-add" size={16} color={theme.primary} />
                        <Text style={[styles.emptySlotActionText, { color: theme.primary }]}>
                          Invitar
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.emptySlotAction, { borderColor: theme.border }]}
                        onPress={() => void shareInviteLink(team)}
                      >
                        <Ionicons name="share-outline" size={16} color={theme.text} />
                        <Text style={[styles.emptySlotActionText, { color: theme.text }]}>
                          Compartir
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.emptySlotAction, { borderColor: theme.border }]}
                        onPress={() => whatsappInvite(team)}
                      >
                        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                        <Text style={[styles.emptySlotActionText, { color: theme.text }]}>
                          WhatsApp
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View
                  style={[
                    styles.emptySlotsCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.emptySlotsSub, { color: theme.textMuted }]}>
                    Plantilla completa ({TEAM_ROSTER_MAX}/{TEAM_ROSTER_MAX})
                  </Text>
                </View>
              )}
            </>
          ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.card, borderBottomColor: theme.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>Equipos</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollPad}>
        {pendingInvites.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Invitaciones pendientes</Text>
            {pendingInvites.map((inv) => (
              <View key={inv.id} style={styles.inviteCard}>
                <Text style={styles.inviteMeta}>De {inv.inviterName}</Text>
                <Text style={styles.inviteName}>{inv.teamName}</Text>
                <View style={styles.rowActions}>
                  <Pressable
                    style={styles.outlineBtnSm}
                    onPress={() =>
                      void respondToInvite(inv.id, false).then((r) => {
                        if (!r.ok && r.error) Alert.alert('Error', r.error)
                      })
                    }
                  >
                    <Text style={styles.outlineBtnSmText}>Rechazar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtnSm}
                    onPress={() =>
                      void respondToInvite(inv.id, true).then((r) => {
                        if (!r.ok && r.error) Alert.alert('Error', r.error)
                      })
                    }
                  >
                    <Text style={styles.primaryBtnText}>Aceptar</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {pendingJoinForCaptain.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Solicitudes a tus equipos</Text>
            {pendingJoinForCaptain.map((r) => (
              <View key={r.id} style={styles.inviteCard}>
                <View style={styles.joinRow}>
                  <Image
                    source={{ uri: r.requesterPhoto }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inviteName}>{r.teamName}</Text>
                    <Text style={styles.inviteMeta}>{r.requesterName}</Text>
                  </View>
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    style={styles.outlineBtnSm}
                    onPress={() =>
                      void respondToJoinRequest(r.id, false).then((res) => {
                        if (!res.ok && res.error) Alert.alert('Error', res.error)
                      })
                    }
                  >
                    <Text style={styles.outlineBtnSmText}>Rechazar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtnSm}
                    onPress={() =>
                      void respondToJoinRequest(r.id, true).then((res) => {
                        if (!res.ok && res.error) Alert.alert('Error', res.error)
                      })
                    }
                  >
                    <Text style={styles.primaryBtnText}>Aceptar</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {incomingRivalChallenges.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Desafíos de rival</Text>
            {incomingRivalChallenges.map((c) => {
              const sel =
                challengeTeamPick[c.id] ??
                (c.mode === 'direct' ? c.challengedTeamId ?? '' : '')
              const canAccept =
                c.mode === 'direct'
                  ? !!c.challengedTeamId
                  : !!sel && myCaptainTeams.length > 0
              return (
                <View key={c.id} style={styles.challengeCard}>
                  <Text style={styles.challengeKicker}>
                    {c.mode === 'direct' ? 'Desafío directo' : 'Búsqueda abierta'}
                  </Text>
                  <Text style={styles.inviteName}>{c.opportunityTitle}</Text>
                  <Text style={styles.inviteMeta}>
                    {c.challengerTeamName}
                    {c.mode === 'direct' && c.challengedTeamName
                      ? ` vs ${c.challengedTeamName}`
                      : ''}
                  </Text>
                  {c.mode === 'open' && myCaptainTeams.length > 0 ? (
                    <View style={styles.pickerWrap}>
                      {myCaptainTeams.map((t) => (
                        <Pressable
                          key={t.id}
                          style={[
                            styles.pickerOpt,
                            sel === t.id && styles.pickerOptOn,
                          ]}
                          onPress={() =>
                            setChallengeTeamPick((prev) => ({
                              ...prev,
                              [c.id]: t.id,
                            }))
                          }
                        >
                          <Text
                            style={[
                              styles.pickerOptText,
                              sel === t.id && styles.pickerOptTextOn,
                            ]}
                          >
                            {t.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.rowActions}>
                    <Pressable
                      style={styles.outlineBtnSm}
                      onPress={() => void onRivalChallenge(c, false)}
                    >
                      <Text style={styles.outlineBtnSmText}>Rechazar</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.primaryBtnSm,
                        styles.rivalAccept,
                        !canAccept && styles.btnDisabled,
                      ]}
                      disabled={!canAccept}
                      onPress={() => void onRivalChallenge(c, true)}
                    >
                      <Text style={styles.primaryBtnText}>Aceptar</Text>
                    </Pressable>
                  </View>
                </View>
              )
            })}
          </View>
        ) : null}

        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Text style={[styles.blockTitle, { color: theme.text }]}>
              Mis equipos
            </Text>
            <Pressable
              style={[
                styles.createPill,
                { backgroundColor: theme.primary },
                isTeamLimitReached && styles.btnDisabled,
              ]}
              disabled={isTeamLimitReached}
              onPress={() => setView('create')}
            >
              <Text style={styles.createPillText}>+ Crear</Text>
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Puedes ser parte de hasta {TEAM_USER_MAX_MEMBERSHIPS} equipos en total
            (incluye los que creas y a los que te unes).
          </Text>
          {userTeams.length > 0 ? (
            userTeams.map((t) => renderMyTeamCard(t))
          ) : (
            <View
              style={[
                styles.emptyBox,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="people-outline" size={42} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                No tienes equipos aún
              </Text>
              <Pressable onPress={() => setView('create')}>
                <Text style={[styles.emptyLink, { color: theme.primary }]}>
                  Crear tu primer equipo
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.block}>
          <Text style={[styles.blockTitle, { color: theme.text }]}>
            Equipos en tu región
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Descubre planteles cerca tuyo: lee la descripción, mira el fogueo y pide
            unirte o manda un desafío.
          </Text>
          {discoverList.length > 0 ? (
            <View style={styles.discoverListWrap}>
              <FlatList
                data={discoverList}
                keyExtractor={(item) => item.id}
                renderItem={renderDiscoverListItem}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              />
            </View>
          ) : (
            <Text style={[styles.muted, { color: theme.textMuted }]}>
              No hay equipos disponibles con tus filtros de ubicación y género.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles(theme: ReturnType<typeof useScreenTheme>) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { fontSize: 14, color: theme.textMuted },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  scrollPad: { padding: 16, paddingBottom: 40 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  backLink: { fontSize: 16, color: theme.primary, fontWeight: '700' },
  h1: { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 8 },
  sub: { fontSize: 14, color: theme.textMuted, marginBottom: 12 },
  bodyText: { fontSize: 15, color: theme.text, lineHeight: 22, marginBottom: 12 },
  warn: { color: theme.accent, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: theme.card,
    color: theme.text,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  levelCell: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  levelCellOn: {
    borderColor: theme.primary,
    backgroundColor: theme.selectedTint,
  },
  levelCellText: { fontSize: 14, fontWeight: '600', color: theme.text },
  levelCellTextOn: { color: theme.primary },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: theme.primaryBtnText, fontSize: 16, fontWeight: '700' },
  primaryBtnSm: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  outlineBtnSm: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: theme.card,
  },
  outlineBtnSmText: { fontSize: 14, fontWeight: '600', color: theme.text },
  btnDisabled: { opacity: 0.45 },
  block: { marginBottom: 24 },
  discoverListWrap: {
    maxHeight: 580,
  },
  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  hint: { fontSize: 12, color: theme.textMuted, marginBottom: 10 },
  createPill: {
    backgroundColor: theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  createPillText: { color: theme.primaryBtnText, fontWeight: '700', fontSize: 13 },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyLink: { fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: theme.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  cardMid: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1 },
  cardMeta: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  cardDesc: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  myTeamCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  discoverCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  discoverCardPressable: { padding: 14 },
  discoverTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: { fontSize: 12, fontWeight: '800' },
  discoverLogo: { width: 58, height: 58, borderRadius: 14 },
  discoverBadgesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  levelPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  levelPillText: { fontSize: 11, fontWeight: '700' },
  rosterHint: { fontSize: 12, fontWeight: '600' },
  recordRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  recordCell: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  recordNum: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  recordLabel: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  fogueoBlock: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    paddingTop: 10,
  },
  fogueoTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fogueoSubtitle: { fontSize: 12 },
  fogueoBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  fogueoTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fogueoFill: { height: '100%', borderRadius: 4 },
  fogueoTier: { fontSize: 11, fontWeight: '700', maxWidth: 120 },
  discoverDesc: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    fontSize: 13,
    lineHeight: 18,
  },
  discoverActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  btnJoinOutline: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnJoinOutlineText: { fontSize: 13, fontWeight: '700' },
  btnChallenge: {
    flex: 1,
    borderRadius: 10,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnChallengeText: { fontSize: 13, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  smallBtnOff: { opacity: 0.5 },
  smallBtnText: { fontSize: 13, fontWeight: '600', color: theme.text },
  smallBtnRival: {
    flex: 1,
    backgroundColor: theme.danger,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  smallBtnRivalText: { fontSize: 13, fontWeight: '700', color: theme.primaryBtnText },
  inviteCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 10,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    backgroundColor: theme.card,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  inviteName: { fontSize: 16, fontWeight: '700', color: theme.text },
  inviteMeta: { fontSize: 13, color: theme.textMuted },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.skeleton },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  challengeCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
    padding: 14,
    marginBottom: 10,
  },
  challengeKicker: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.danger,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  pickerOpt: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  pickerOptOn: {
    borderColor: theme.primary,
    backgroundColor: theme.selectedTint,
  },
  pickerOptText: { fontSize: 13, color: theme.text },
  pickerOptTextOn: { fontWeight: '700', color: theme.primary },
  rivalAccept: { backgroundColor: theme.danger },
  detailHead: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  detailHeroCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.2 : 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  detailHeroBody: { width: '100%', alignItems: 'center', marginTop: 12 },
  detailHeroName: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  detailHeroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  detailCityPill: { fontSize: 11, fontWeight: '600', marginLeft: 4 },
  detailCityPillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailRosterHint: { fontSize: 13, marginTop: 8, textAlign: 'center' },
  detailDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  detailStatsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  detailSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  detailJoinBanner: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  detailJoinBannerText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  detailJoinBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailLeadershipRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  detailLeadCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  detailLeadLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  detailLeadName: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  detailPlantillaHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailPlantillaCount: { fontSize: 13, fontWeight: '600' },
  detailInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 11,
    marginBottom: 12,
  },
  detailInviteBtnText: { fontSize: 14, fontWeight: '700' },
  detailMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  detailMemberBody: { flex: 1, minWidth: 0 },
  detailStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  detailStatusPillText: { fontSize: 11, fontWeight: '700' },
  emptySlotsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 14,
    marginTop: 4,
  },
  emptySlotsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptySlotsIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotsTitle: { fontSize: 15, fontWeight: '700' },
  emptySlotsSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  emptySlotsActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  emptySlotAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
  },
  emptySlotActionText: { fontSize: 12, fontWeight: '700' },
  detailLogo: {
    width: 88,
    height: 88,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  detailLogoImg: { width: '100%', height: '100%' },
  logoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  capActions: { flexDirection: 'row', gap: 10 },
  link: { fontSize: 14, fontWeight: '700', color: theme.primary },
  dangerLink: { fontSize: 14, fontWeight: '600', color: theme.danger },
  joinBox: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    marginBottom: 16,
  },
  joinTitle: { fontWeight: '700', marginBottom: 10 },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  coordSection: { marginBottom: 16 },
  waBtn: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  waBtnText: { color: theme.primaryBtnText, fontWeight: '700', fontSize: 16 },
  teamRulesCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
    marginBottom: 14,
  },
  teamRulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  teamRulesIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamRulesTitle: { fontSize: 16, fontWeight: '800' },
  teamRulesSub: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  teamRulesList: { marginTop: 8 },
  teamRuleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  teamRuleRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  teamRuleNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  teamRuleNumText: { fontSize: 13, fontWeight: '800' },
  teamRuleText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    alignItems: 'center',
  },
  statNum: { fontSize: 28, fontWeight: '800', color: theme.primary },
  statLabel: { fontSize: 12, color: theme.textMuted },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  roleRow: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginBottom: 12,
  },
  roleText: { fontSize: 13, color: theme.text, fontWeight: '600' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  slotActions: { flexDirection: 'row', gap: 12, marginLeft: 'auto' },
  captainTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  captainDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  captainDeleteText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  captainHeroCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  captainLogoBox: {
    width: 72,
    height: 72,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  captainLogoImg: { width: '100%', height: '100%' },
  captainHeroInfo: { flex: 1, minWidth: 0 },
  captainHeroName: { fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },
  captainPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  captainBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  captainBadgePillText: { fontSize: 11, fontWeight: '700', color: '#CA8A04' },
  captainHeroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
  },
  captainDescCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  captainDescText: { fontSize: 14, lineHeight: 21 },
  captainImpulseCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  captainImpulseTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  captainImpulseIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captainImpulseTier: { fontSize: 16, fontWeight: '800' },
  captainImpulseSub: { fontSize: 13, marginTop: 2 },
  captainImpulseLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  captainImpulseBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  captainImpulsePct: { fontSize: 13, fontWeight: '800', minWidth: 36, textAlign: 'right' },
  captainImpulseStats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  captainImpulseStat: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  captainImpulseStatLabel: { fontSize: 11, fontWeight: '600' },
  captainImpulseStatVal: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  captainImpulseFoot: { fontSize: 11, lineHeight: 16, marginTop: 12 },
  captainSectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  captainSectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  captainVicePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  captainVicePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captainViceName: { flex: 1, fontSize: 15, fontWeight: '600' },
  captainWaCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  captainWaHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  captainWaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(37,211,102,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captainWaTitle: { fontSize: 15, fontWeight: '800' },
  captainWaSub: { fontSize: 12, marginTop: 2 },
  captainWaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  captainWaJoinBtn: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  captainWaJoinText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  captainWaEditBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  captainWaEditText: { fontSize: 14, fontWeight: '600' },
  captainMetricsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  captainMetricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 18,
    alignItems: 'center',
  },
  captainMetricNum: { fontSize: 36, fontWeight: '800' },
  captainMetricLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  captainPlantillaHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  captainInvitePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  captainInvitePillText: { color: theme.primaryBtnText, fontSize: 13, fontWeight: '700' },
  captainMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  captainMemberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  captainRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  captainRoleBadgeText: { fontSize: 10, fontWeight: '800', color: '#CA8A04' },
  captainActiveWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  captainActiveDot: { width: 7, height: 7, borderRadius: 4 },
  captainActiveText: { fontSize: 12, fontWeight: '700' },
  captainPendingText: { fontSize: 12, fontWeight: '600' },
})
}
