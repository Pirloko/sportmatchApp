import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthScreen } from '../components/auth-screen';
import { OnboardingScreen } from '../components/onboarding-screen';
import { VenueOnboardingScreen } from '../components/venue-onboarding-screen';
import { PlayerEntryRedirect } from '../components/player-entry-redirect';
import { isSupabaseConfigured } from '../lib/supabase/client';
import { useApp } from '../lib/app-provider';

export default function RootGateScreen() {
  const {
    authLoading,
    isAuthenticated,
    currentUser,
    logout,
    needsOnboarding,
    needsVenueOnboarding,
    onboardingSource,
  } = useApp();

  const supabaseOk = isSupabaseConfigured();

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Cargando sesión…</Text>
      </View>
    );
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

  if (needsVenueOnboarding) {
    return (
      <View style={styles.flexFill}>
        <VenueOnboardingScreen />
      </View>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    opacity: 0.7,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  note: {
    fontSize: 15,
    opacity: 0.75,
    marginBottom: 8,
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
