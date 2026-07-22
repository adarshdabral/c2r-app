import { Stack } from "expo-router";

export default function RecyclerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#eef1ee" },
        headerStyle: { backgroundColor: "#eef1ee" },
        headerShadowVisible: false,
        headerTintColor: "#14181a",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
