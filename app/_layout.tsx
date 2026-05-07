import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider } from '../lib/app-provider';
import { PushBootstrap } from '../lib/push/bootstrap';
import { TelemetryBootstrap } from '../lib/telemetry/bootstrap';
import { ThemeProvider, useThemePreference } from '../lib/theme-context';
import { AppQueryProvider } from '../src/app/providers/query-provider';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutWithTheme />
    </ThemeProvider>
  );
}

function RootLayoutWithTheme() {
  const { resolved, tokens } = useThemePreference();
  return (
    <AppQueryProvider>
      <AppProvider>
        <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
        <PushBootstrap />
        <TelemetryBootstrap />
        <Stack
          screenOptions={{
            headerShown: true,
            contentStyle: { backgroundColor: tokens.bgDark },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="swipe" options={{ title: 'Swipe', headerShown: false }} />
          <Stack.Screen name="mi-centro" options={{ title: 'Mi centro', headerShown: false }} />
          <Stack.Screen name="centro" options={{ headerShown: false }} />
          <Stack.Screen name="admin" options={{ title: 'Admin', headerShown: false }} />
          <Stack.Screen name="equipo" options={{ title: 'Equipo', headerShown: false }} />
        </Stack>
      </AppProvider>
    </AppQueryProvider>
  );
}
