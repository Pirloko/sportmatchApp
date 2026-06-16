import { Stack } from 'expo-router';

import { useThemePreference } from '../../../lib/theme-context';
import { buildScreenTheme, navigationThemeOptions } from '../../../lib/theme-ui';

export default function PartidosStackLayout() {
  const { tokens, resolved, colorVision } = useThemePreference();
  const theme = buildScreenTheme(tokens, resolved, colorVision);
  const nav = navigationThemeOptions(theme);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Atrás',
        ...nav,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Partidos', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Partido' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat', headerShown: false }} />
    </Stack>
  );
}
