import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";

/**
 * User area stack. The (tabs) group holds the bottom-tab screens; detail
 * screens (store detail, new pickup, my drop-offs, booking) are pushed on top
 * with a header + back button.
 */
export default function UserLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
        headerTintColor: c.foreground,
        // Editorial serif on every pushed-screen header (Store, Schedule
        // Pickup, My Drop-offs, My Rewards, Notifications).
        headerTitleStyle: { fontFamily: "Fraunces_700Bold", fontSize: 18 },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="stores/[storeId]" options={{ headerShown: true, title: "Store" }} />
      <Stack.Screen name="pickup/new" options={{ headerShown: true, title: "Schedule Pickup" }} />
      <Stack.Screen name="dropoff/mine" options={{ headerShown: true, title: "My Drop-offs" }} />
      <Stack.Screen name="booking" options={{ headerShown: true, title: "Book a Pickup" }} />
      <Stack.Screen name="rewards" options={{ headerShown: true, title: "My Rewards" }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications" }} />
      <Stack.Screen name="drives" options={{ headerShown: false }} />
      <Stack.Screen name="reports" options={{ headerShown: false }} />
      <Stack.Screen name="assistant" options={{ headerShown: false }} />
      <Stack.Screen name="activity" options={{ headerShown: false }} />
    </Stack>
  );
}
