import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useSegments } from 'expo-router';
import { useEffect } from 'react';
import type { ComponentProps } from 'react';

import { persistPlayerLastNav, type PlayerNavId } from '../../lib/player-nav-storage';
import { useApp } from '../../lib/app-provider';
import {
  isMobilePlayerAccount,
  isPlayerOnlyMobilePlatform,
} from '../../lib/mobile-app-access';
import { useThemePreference } from '../../lib/theme-context';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(
  name: IconName,
  focused: boolean,
  colors: { active: string; inactive: string }
) {
  return (
    <Ionicons
      name={name}
      size={focused ? 26 : 24}
      color={focused ? colors.active : colors.inactive}
    />
  );
}

const SEGMENT_TO_NAV: Record<string, PlayerNavId> = {
  home: 'home',
  explorar: 'explore',
  partidos: 'matches',
  crear: 'create',
  equipos: 'teams',
  ranking: 'ranking',
  perfil: 'profile',
};

export default function PlayerTabsLayout() {
  const { currentUser, needsOnboarding, onboardingSource } = useApp();
  const { tokens } = useThemePreference();
  const segments = useSegments();
  const iconColors = {
    active: tokens.primaryGreen,
    inactive: tokens.textMuted,
  };

  useEffect(() => {
    const seg = segments[segments.length - 1];
    if (typeof seg !== 'string') return;
    const id = SEGMENT_TO_NAV[seg];
    if (id) void persistPlayerLastNav(id);
  }, [segments]);

  if (!currentUser) {
    return <Redirect href="/" />;
  }

  if (
    isPlayerOnlyMobilePlatform() &&
    !isMobilePlayerAccount(currentUser.accountType)
  ) {
    return <Redirect href="/" />;
  }

  const mustFinishPlayerOnboarding =
    currentUser.accountType === 'player' &&
    (needsOnboarding || onboardingSource === 'profile_edit');
  if (mustFinishPlayerOnboarding) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: tokens.primaryGreen,
        tabBarInactiveTintColor: tokens.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarStyle: {
          borderTopColor: tokens.borderDark,
          backgroundColor: tokens.cardDark,
          paddingTop: 4,
          paddingBottom: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
          headerShown: false,
          tabBarLabel: 'Inicio',
          tabBarIcon: ({ focused }) =>
            tabIcon(focused ? 'home' : 'home-outline', focused, iconColors),
        }}
      />
      <Tabs.Screen
        name="explorar"
        options={{
          // Oculto en tab bar por ahora; la ruta /explorar sigue activa (router.push, etc.)
          href: null,
          title: 'Explorar',
          headerShown: false,
          tabBarLabel: 'Explorar',
          tabBarIcon: ({ focused }) =>
            tabIcon(focused ? 'search' : 'search-outline', focused, iconColors),
        }}
      />
      <Tabs.Screen
        name="partidos"
        options={{
          title: 'Partidos',
          tabBarLabel: 'Partidos',
          headerShown: false,
          tabBarIcon: ({ focused }) =>
            tabIcon(focused ? 'list' : 'list-outline', focused, iconColors),
        }}
      />
      <Tabs.Screen
        name="crear"
        options={{
          title: 'Crear',
          headerShown: false,
          tabBarLabel: 'Crear',
          tabBarIcon: ({ focused }) =>
            tabIcon(
              focused ? 'add-circle' : 'add-circle-outline',
              focused,
              iconColors
            ),
        }}
      />
      <Tabs.Screen
        name="equipos"
        options={{
          title: 'Equipos',
          headerShown: false,
          tabBarLabel: 'Equipos',
          tabBarIcon: ({ focused }) =>
            tabIcon(focused ? 'people' : 'people-outline', focused, iconColors),
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: 'Ranking',
          headerShown: false,
          tabBarLabel: 'Ranking',
          tabBarIcon: ({ focused }) =>
            tabIcon(
              focused ? 'podium' : 'podium-outline',
              focused,
              iconColors
            ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          href: null,
          title: 'Perfil',
          headerShown: false,
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ focused }) =>
            tabIcon(focused ? 'person' : 'person-outline', focused, iconColors),
        }}
      />
    </Tabs>
  );
}
