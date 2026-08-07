import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";

export default function RecyclerLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
        headerTintColor: c.foreground,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="drives" options={{ headerShown: false }} />
    </Stack>
  );
}
