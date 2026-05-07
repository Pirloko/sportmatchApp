import { Ionicons } from '@expo/vector-icons'
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { levelLabel } from '../lib/format-match'
import { saveRivalTargetTeamId } from '../lib/rival-prefill'
import { teamInviteAbsoluteUrl } from '../lib/team-invite-url'
import { useApp } from '../lib/app-provider'
import { useThemePreference } from '../lib/theme-context'
import { createClient, isSupabaseConfigured } from '../lib/supabase/client'
import { fetchTeamPrivateSettings } from '../lib/supabase/team-queries'
import {
  deleteTeamLogoFile,
  uploadTeamLogoFromUri,
} from '../lib/supabase/team-logos'
import {
  rankTeamsByRivalRecord,
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
  const { tokens, resolved } = useThemePreference()

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
  const [discoverTab, setDiscoverTab] = useState<'region' | 'ranking'>('region')

  const userTeams = getUserTeams()
  const myCaptainTeams = userTeams.filter((t) => t.captainId === currentUser?.id)
  const isTeamLimitReached = userTeams.length >= TEAM_USER_MAX_MEMBERSHIPS

  const discoverPool = useMemo(() => {
    if (!currentUser) return []
    return getFilteredTeams(currentUser.gender)
      .filter((t) => !userTeams.some((ut) => ut.id === t.id))
      .filter((t) => teamIsInPlayerGeo(currentUser, t))
  }, [currentUser, getFilteredTeams, userTeams])

  const regionOrderedTeams = useMemo(
    () =>
      [...discoverPool].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      ),
    [discoverPool]
  )

  const rankingOrderedTeams = useMemo(
    () => rankTeamsByRivalRecord(discoverPool),
    [discoverPool]
  )

  const discoverList =
    discoverTab === 'region' ? regionOrderedTeams : rankingOrderedTeams

  const ui = useMemo(
    () => ({
      statWinBg:
        resolved === 'dark' ? 'rgba(55, 214, 122, 0.18)' : 'rgba(47, 158, 68, 0.12)',
      statDrawBg:
        resolved === 'dark' ? 'rgba(251, 191, 36, 0.16)' : 'rgba(245, 158, 11, 0.14)',
      statLossBg:
        resolved === 'dark' ? 'rgba(248, 113, 113, 0.14)' : 'rgba(239, 68, 68, 0.1)',
      logoBoxBg:
        resolved === 'dark' ? 'rgba(55, 214, 122, 0.15)' : 'rgba(47, 158, 68, 0.12)',
      tabInactiveBg:
        resolved === 'dark' ? 'rgba(255,255,255,0.06)' : '#e5e7eb',
    }),
    [resolved]
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
      const supabase = createClient()
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
      const supabase = createClient()
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
        const supabase = createClient()
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

  const doDeleteTeam = async () => {
    if (!detailTeam) return
    try {
      if (detailTeam.logo && isSupabaseConfigured()) {
        const supabase = createClient()
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
          { backgroundColor: tokens.cardDark, borderColor: tokens.borderDark },
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
              <Ionicons name="shield" size={26} color={tokens.primaryGreen} />
            )}
          </View>
          <View style={styles.cardMid}>
            <View style={styles.cardTitleRow}>
              <Text
                style={[styles.cardTitle, { color: tokens.textPrimary }]}
                numberOfLines={1}
              >
                {team.name}
              </Text>
              {isCaptain ? (
                <Ionicons name="ribbon" size={16} color={tokens.accentGold} />
              ) : null}
            </View>
            <Text style={[styles.cardMeta, { color: tokens.textMuted }]}>
              {LEVEL_LABELS[team.level]} · {roster}/{TEAM_ROSTER_MAX} jugadores
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={tokens.textMuted} />
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
            backgroundColor: tokens.cardDark,
            borderColor: tokens.borderDark,
            shadowColor: resolved === 'dark' ? '#000' : '#000',
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
                  { backgroundColor: ui.logoBoxBg, borderColor: tokens.borderDark },
                ]}
              >
                <Text style={[styles.rankBadgeText, { color: tokens.primaryGreen }]}>
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
                <Ionicons name="shield" size={28} color={tokens.primaryGreen} />
              )}
            </View>
            <View style={styles.cardMid}>
              <View style={styles.cardTitleRow}>
                <Text
                  style={[styles.cardTitle, { color: tokens.textPrimary }]}
                  numberOfLines={2}
                >
                  {team.name}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={tokens.textMuted} />
              </View>
              <View style={styles.discoverBadgesRow}>
                <View
                  style={[
                    styles.levelPill,
                    { backgroundColor: ui.logoBoxBg },
                  ]}
                >
                  <Text style={[styles.levelPillText, { color: tokens.primaryGreen }]}>
                    {LEVEL_LABELS[team.level]}
                  </Text>
                </View>
                <Text style={[styles.rosterHint, { color: tokens.textMuted }]}>
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
              <Ionicons name="trophy" size={16} color={tokens.primaryGreen} />
              <Text style={[styles.recordNum, { color: tokens.textPrimary }]}>{w}</Text>
              <Text style={[styles.recordLabel, { color: tokens.textMuted }]}>
                VICTORIAS
              </Text>
            </View>
            <View
              style={[
                styles.recordCell,
                { backgroundColor: ui.statDrawBg },
              ]}
            >
              <Ionicons name="remove-outline" size={18} color="#CA8A04" />
              <Text style={[styles.recordNum, { color: tokens.textPrimary }]}>{d}</Text>
              <Text style={[styles.recordLabel, { color: tokens.textMuted }]}>
                EMPATES
              </Text>
            </View>
            <View
              style={[
                styles.recordCell,
                { backgroundColor: ui.statLossBg },
              ]}
            >
              <Ionicons name="trending-down-outline" size={16} color={tokens.danger} />
              <Text style={[styles.recordNum, { color: tokens.textPrimary }]}>{l}</Text>
              <Text style={[styles.recordLabel, { color: tokens.textMuted }]}>
                DERROTAS
              </Text>
            </View>
          </View>

          <View style={styles.fogueoBlock}>
            <View style={styles.fogueoTop}>
              <Ionicons name="flame-outline" size={18} color="#EA580C" />
              <Text
                style={[styles.fogueoSubtitle, { color: tokens.textMuted, flex: 1 }]}
              >
                {fogueo.subtitle}
              </Text>
            </View>
            <View style={styles.fogueoBarRow}>
              <View
                style={[
                  styles.fogueoTrack,
                  {
                    backgroundColor:
                      resolved === 'dark' ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
                  },
                ]}
              >
                <View
                  style={[
                    styles.fogueoFill,
                    {
                      width: `${Math.round(fogueo.progress * 100)}%`,
                      backgroundColor: tokens.primaryGreen,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.fogueoTier, { color: tokens.textPrimary }]}
                numberOfLines={1}
              >
                {fogueo.tierLabel}
              </Text>
            </View>
          </View>

          {team.description ? (
            <Text style={[styles.discoverDesc, { color: tokens.textMuted }]}>
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
                  borderColor: tokens.borderDark,
                  backgroundColor: resolved === 'dark' ? 'transparent' : tokens.cardDark,
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
              <Ionicons name="hand-left-outline" size={18} color={tokens.textPrimary} />
              <Text style={[styles.btnJoinOutlineText, { color: tokens.textPrimary }]}>
                {myJoin ? 'Pendiente' : 'Solicitar unirme'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnChallenge,
                {
                  backgroundColor:
                    resolved === 'dark'
                      ? 'rgba(248, 113, 113, 0.35)'
                      : 'rgba(239, 68, 68, 0.2)',
                },
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
              <Ionicons name="shield-outline" size={18} color={tokens.danger} />
              <Text style={[styles.btnChallengeText, { color: tokens.danger }]}>
                Desafiar
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    )
  }

  const renderDiscoverListItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Team>) =>
      renderDiscoverTeamCard(item, discoverTab === 'ranking' ? index + 1 : null),
    [discoverTab, renderDiscoverTeamCard]
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
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
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
            placeholderTextColor="#9ca3af"
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
            placeholderTextColor="#9ca3af"
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
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
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
            placeholderTextColor="#9ca3af"
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
    const viceMember = team.members.find(
      (m) => m.id !== team.captainId && m.status === 'confirmed'
    )
    const isMember = isMemberOfTeam(team)
    const myJoin = myPendingJoinForTeam(team.id)
    const incomingJoin = pendingJoinForTeam(team.id)
    const slotsAvailable = TEAM_ROSTER_MAX - team.members.length

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollPad}>
          <Pressable
            onPress={() => {
              setTeamDetailEditing(false)
              setSelectedTeam(null)
              setView('list')
            }}
            style={styles.backRow}
          >
            <Text style={styles.backLink}>← Volver</Text>
          </Pressable>

          <View style={styles.detailHead}>
            <Pressable onPress={isCaptain ? () => void pickLogo() : undefined}>
              <View style={styles.detailLogo}>
                {team.logo ? (
                  <Image
                    source={{ uri: team.logo }}
                    style={styles.detailLogoImg}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons name="shield" size={40} color="#2563eb" />
                )}
                {isCaptain && savingTeam ? (
                  <View style={styles.logoOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              {isCaptain && teamDetailEditing ? (
                <>
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
                </>
              ) : (
                <>
                  <View style={styles.detailTitleRow}>
                    <Text style={styles.h1}>{team.name}</Text>
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
                        <Text style={styles.link}>Salir</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={styles.sub}>
                    {LEVEL_LABELS[team.level]} · {team.city}
                    {isCaptain ? ' · Capitán' : ''}
                  </Text>
                  {isCaptain && team.logo ? (
                    <Pressable onPress={() => void handleRemoveLogo()} disabled={savingTeam}>
                      <Text style={styles.dangerLink}>Quitar escudo</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </View>

          {!teamDetailEditing && team.description ? (
            <Text style={styles.bodyText}>{team.description}</Text>
          ) : null}

          {isCaptain && incomingJoin.length > 0 && !teamDetailEditing ? (
            <View style={styles.joinBox}>
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

          {!isCaptain && !isMember && team.gender === currentUser.gender ? (
            <View style={styles.joinBox}>
              {slotsAvailable === 0 ? (
                <Text style={styles.muted}>Plantilla completa.</Text>
              ) : myJoin ? (
                <View style={styles.joinRow}>
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
                  style={styles.primaryBtn}
                  onPress={() =>
                    void requestToJoinTeam(team.id).then((res) => {
                      if (!res.ok && res.error) Alert.alert('Solicitud', res.error)
                    })
                  }
                >
                  <Text style={styles.primaryBtnText}>Solicitar unirme</Text>
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
                  {memberPrivateSettings?.rulesText ? (
                    <View style={styles.rulesBox}>
                      <Text style={styles.rulesTitle}>Reglas</Text>
                      <Text style={styles.rulesBody}>
                        {memberPrivateSettings.rulesText}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{team.members.length}</Text>
              <Text style={styles.statLabel}>Jugadores</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{slotsAvailable}</Text>
              <Text style={styles.statLabel}>Cupos</Text>
            </View>
          </View>
          <View style={styles.roleRow}>
            <Text style={styles.roleText}>Capitán: {team.members.find((m) => m.id === team.captainId)?.name || 'Sin dato'}</Text>
            <Text style={styles.roleText}>
              Vice: {viceMember?.name || 'Por definir'}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Plantilla</Text>
          {isCaptain && slotsAvailable > 0 ? (
            <Pressable
              style={[styles.primaryBtn, { marginBottom: 12 }]}
              onPress={() => setView('invite')}
            >
              <Text style={styles.primaryBtnText}>Invitar jugadores</Text>
            </Pressable>
          ) : null}

          {team.members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <Image
                source={{ uri: member.photo }}
                style={styles.avatar}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.inviteName}>{member.name}</Text>
                  {team.captainId === member.id ? (
                    <Ionicons name="ribbon" size={14} color="#d97706" />
                  ) : viceMember?.id === member.id ? (
                    <Ionicons name="shield-checkmark" size={14} color="#2563eb" />
                  ) : null}
                </View>
                <Text style={styles.inviteMeta}>
                  {positionLabel(member.position)} ·{' '}
                  {team.captainId === member.id
                    ? 'Capitán'
                    : viceMember?.id === member.id
                      ? 'Vice'
                      : member.status === 'confirmed'
                        ? 'Activo'
                        : 'Pendiente'}
                </Text>
              </View>
            </View>
          ))}

          {Array.from({ length: slotsAvailable }).map((_, i) => (
            <View key={`slot-${i}`} style={styles.slotRow}>
              <Ionicons name="person-outline" size={24} color="#9ca3af" />
              <Text style={styles.muted}>Cupo disponible</Text>
              {isCaptain ? (
                <View style={styles.slotActions}>
                  <Pressable onPress={() => void shareInviteLink(team)}>
                    <Text style={styles.link}>Compartir</Text>
                  </Pressable>
                  <Pressable onPress={() => whatsappInvite(team)}>
                    <Text style={styles.link}>WhatsApp</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.bgDark }]} edges={['top']}>
      <View
        style={[
          styles.header,
          { backgroundColor: tokens.cardDark, borderBottomColor: tokens.borderDark },
        ]}
      >
        <Text style={[styles.headerTitle, { color: tokens.textPrimary }]}>Equipos</Text>
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
            <Text style={[styles.blockTitle, { color: tokens.textPrimary }]}>
              Mis equipos
            </Text>
            <Pressable
              style={[
                styles.createPill,
                { backgroundColor: tokens.primaryGreen },
                isTeamLimitReached && styles.btnDisabled,
              ]}
              disabled={isTeamLimitReached}
              onPress={() => setView('create')}
            >
              <Text style={styles.createPillText}>+ Crear</Text>
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: tokens.textMuted }]}>
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
                  backgroundColor: tokens.cardDark,
                  borderColor: tokens.borderDark,
                },
              ]}
            >
              <Ionicons name="people-outline" size={42} color={tokens.textMuted} />
              <Text style={[styles.emptyTitle, { color: tokens.textPrimary }]}>
                No tienes equipos aún
              </Text>
              <Pressable onPress={() => setView('create')}>
                <Text style={[styles.emptyLink, { color: tokens.primaryGreen }]}>
                  Crear tu primer equipo
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View
          style={[
            styles.tabsWrap,
            {
              backgroundColor: ui.tabInactiveBg,
              borderColor: tokens.borderDark,
            },
          ]}
        >
          <Pressable
            onPress={() => setDiscoverTab('region')}
            style={[
              styles.tabBtn,
              discoverTab === 'region' && {
                backgroundColor: tokens.cardDark,
              },
            ]}
          >
            <Ionicons
              name="people-outline"
              size={16}
              color={discoverTab === 'region' ? tokens.textPrimary : tokens.textMuted}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: discoverTab === 'region' ? tokens.textPrimary : tokens.textMuted },
              ]}
            >
              Región
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDiscoverTab('ranking')}
            style={[
              styles.tabBtn,
              discoverTab === 'ranking' && {
                backgroundColor: tokens.cardDark,
              },
            ]}
          >
            <Ionicons
              name="trophy-outline"
              size={16}
              color={discoverTab === 'ranking' ? tokens.accent : tokens.textMuted}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: discoverTab === 'ranking' ? tokens.accent : tokens.textMuted },
              ]}
            >
              Ranking
            </Text>
          </Pressable>
        </View>

        <View style={styles.block}>
          <Text style={[styles.blockTitle, { color: tokens.textPrimary }]}>
            {discoverTab === 'region' ? 'Equipos en tu región' : 'Ranking rival'}
          </Text>
          <Text style={[styles.hint, { color: tokens.textMuted }]}>
            {discoverTab === 'region'
              ? 'Descubre planteles cerca tuyo: lee la descripción, mira el fogueo y pide unirte o manda un desafío.'
              : 'Mismos equipos elegibles, ordenados por rendimiento rival: más V, luego más E y menos D.'}
          </Text>
          {discoverList.length > 0 ? (
            <View style={styles.discoverListWrap}>
              <FlashList
                data={discoverList}
                keyExtractor={(item) => item.id}
                renderItem={renderDiscoverListItem}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              />
            </View>
          ) : (
            <Text style={[styles.muted, { color: tokens.textMuted }]}>
              No hay equipos disponibles con tus filtros de ubicación y género.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { fontSize: 14, color: '#6b7280' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  scrollPad: { padding: 16, paddingBottom: 40 },
  backRow: { marginBottom: 12 },
  backLink: { fontSize: 16, color: '#0F4539', fontWeight: '700' },
  h1: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 8 },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  bodyText: { fontSize: 15, color: '#374151', lineHeight: 22, marginBottom: 12 },
  warn: { color: '#b45309', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111',
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  levelCell: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  levelCellOn: { borderColor: '#0F4539', backgroundColor: 'rgba(15,69,57,0.12)' },
  levelCellText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  levelCellTextOn: { color: '#0F4539' },
  primaryBtn: {
    backgroundColor: '#0F4539',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  primaryBtnSm: {
    backgroundColor: '#0F4539',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  outlineBtnSm: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  outlineBtnSmText: { fontSize: 14, fontWeight: '600', color: '#374151' },
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
    color: '#111',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  hint: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  createPill: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  createPillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
  tabsWrap: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabBtnText: { fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  cardMid: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1 },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  cardDesc: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
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
    borderTopColor: '#e5e7eb',
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
    borderTopColor: '#e5e7eb',
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
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  smallBtnOff: { opacity: 0.5 },
  smallBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  smallBtnRival: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  smallBtnRivalText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  inviteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  inviteName: { fontSize: 16, fontWeight: '700', color: '#111' },
  inviteMeta: { fontSize: 13, color: '#6b7280' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb' },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  challengeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
    padding: 14,
    marginBottom: 10,
  },
  challengeKicker: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  pickerOpt: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  pickerOptOn: { borderColor: '#0F4539', backgroundColor: 'rgba(15,69,57,0.12)' },
  pickerOptText: { fontSize: 13, color: '#374151' },
  pickerOptTextOn: { fontWeight: '700', color: '#0F4539' },
  rivalAccept: { backgroundColor: '#dc2626' },
  detailHead: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  detailLogo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  capActions: { flexDirection: 'row', gap: 10 },
  link: { fontSize: 14, fontWeight: '700', color: '#0F4539' },
  dangerLink: { fontSize: 14, fontWeight: '600', color: '#dc2626' },
  joinBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
  waBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  rulesBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rulesTitle: { fontWeight: '700', marginBottom: 6 },
  rulesBody: { fontSize: 14, color: '#374151', lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    alignItems: 'center',
  },
  statNum: { fontSize: 28, fontWeight: '800', color: '#0F4539' },
  statLabel: { fontSize: 12, color: '#6b7280' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  roleRow: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginBottom: 12,
  },
  roleText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  slotActions: { flexDirection: 'row', gap: 12, marginLeft: 'auto' },
})
