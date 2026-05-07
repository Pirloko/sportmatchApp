import { Stack } from 'expo-router';

export default function PartidosStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Atrás',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Partidos', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Partido' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat', headerShown: false }} />
    </Stack>
  );
}
