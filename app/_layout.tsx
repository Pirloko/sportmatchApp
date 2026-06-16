import '../instrumentation';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';

import { AppProvider } from '../lib/app-provider';
import { PushBootstrap } from '../lib/push/bootstrap';
import { TelemetryBootstrap } from '../lib/telemetry/bootstrap';
import { ThemeProvider, useThemePreference } from '../lib/theme-context';
import { buildScreenTheme, navigationThemeOptions } from '../lib/theme-ui';
import { AppQueryProvider } from '../src/app/providers/query-provider';
import { ProfileHydratingOverlay } from '../components/profile-hydrating-overlay';

function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutWithTheme />
    </ThemeProvider>
  );
}

export default Sentry.wrap(RootLayout);

function RootLayoutWithTheme() {
  const { resolved, tokens, colorVision } = useThemePreference();
  const theme = buildScreenTheme(tokens, resolved, colorVision);
  const nav = navigationThemeOptions(theme);
  return (
    <AppQueryProvider>
      <AppProvider>
        <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
        <PushBootstrap />
        <TelemetryBootstrap />
        <Stack
          screenOptions={{
            headerShown: true,
            ...nav,
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="auth/callback"
            options={{ headerShown: false, animation: 'fade' }}
          />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="swipe" options={{ title: 'Swipe', headerShown: false }} />
          <Stack.Screen name="mi-centro" options={{ title: 'Mi centro', headerShown: false }} />
          <Stack.Screen name="centro" options={{ headerShown: false }} />
          <Stack.Screen name="admin" options={{ title: 'Admin', headerShown: false }} />
          <Stack.Screen name="equipo" options={{ title: 'Equipo', headerShown: false }} />
          <Stack.Screen
            name="notificaciones"
            options={{ title: 'Notificaciones', headerShown: false }}
          />
          <Stack.Screen
            name="privacy-policy"
            options={{ title: 'Política de Privacidad' }}
          />
          <Stack.Screen name="terms" options={{ title: 'Términos de Uso' }} />
        </Stack>
        <ProfileHydratingOverlay />
      </AppProvider>
    </AppQueryProvider>
  );
}
