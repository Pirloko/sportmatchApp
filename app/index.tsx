import { Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthProfileLoadingScreen } from '../components/auth-profile-loading-screen';
import { AuthScreen } from '../components/auth-screen';
import { MobileAccessRestrictedScreen } from '../components/mobile-access-restricted-screen';
import { OnboardingScreen } from '../components/onboarding-screen';
import { PlayerEntryRedirect } from '../components/player-entry-redirect';
import {
  isMobilePlayerAccount,
  isPlayerOnlyMobilePlatform,
} from '../lib/mobile-app-access';
import { isSupabaseConfigured } from '../lib/supabase/client';
import { useApp } from '../lib/app-provider';

export default function RootGateScreen() {
  const {
    authLoading,
    isAuthenticated,
    currentUser,
    logout,
    needsOnboarding,
    onboardingSource,
  } = useApp();

  const supabaseOk = isSupabaseConfigured();

  if (authLoading) {
    return <AuthProfileLoadingScreen message="Cargando sesión…" />;
  }

  if (!supabaseOk) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>SportMatch</Text>
        <Text style={[styles.badge, styles.badgeWarn]}>
          Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en
          .env
        </Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.authContainer}>
        <AuthScreen />
      </View>
    );
  }

  if (
    isPlayerOnlyMobilePlatform() &&
    currentUser &&
    !isMobilePlayerAccount(currentUser.accountType)
  ) {
    return (
      <MobileAccessRestrictedScreen
        accountType={currentUser.accountType}
        onLogout={() => void logout()}
      />
    );
  }

  const showPlayerOnboarding =
    currentUser?.accountType === 'player' &&
    (needsOnboarding || onboardingSource === 'profile_edit');

  if (showPlayerOnboarding) {
    return (
      <View style={styles.flexFill}>
        <OnboardingScreen />
      </View>
    );
  }

  if (currentUser?.accountType === 'player') {
    return <PlayerEntryRedirect />;
  }

  if (currentUser?.accountType === 'venue') {
    return <Redirect href="/mi-centro" />;
  }

  if (currentUser?.accountType === 'admin') {
    return <Redirect href="/admin" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SportMatch</Text>
      <Pressable style={styles.outBtn} onPress={() => void logout()}>
        <Text style={styles.outBtnText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#020303',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  outBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
  },
  outBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  badge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 13,
  },
  badgeWarn: {
    backgroundColor: '#fef7e0',
    color: '#8a5700',
  },
});
