import "../global.css";

import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { useFonts } from "expo-font";
// Import the three weights' .ttf directly (not the package index) so Metro only
// bundles what we use, not all 18 Fraunces cuts.
import Fraunces_600SemiBold from "@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf";
import Fraunces_700Bold from "@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf";
import Fraunces_900Black from "@expo-google-fonts/fraunces/900Black/Fraunces_900Black.ttf";
import { AuthProvider, useAuth, homeRouteFor } from "@/context/AuthContext";
import { LoadingState } from "@/components/ui";

// Route groups that are reachable without a session.
const PUBLIC_GROUPS = ["(auth)"];

/**
 * Central auth + role guard (replaces the web `middleware.ts` cookie check and
 * the client-side role routing). Redirects:
 *  - unauthenticated users out of protected groups → /login
 *  - authenticated users out of the auth group / landing → their role home
 *  - authenticated users out of a group that doesn't match their role
 */
function useProtectedRoute() {
  const { loading, isAuthenticated, role, userType } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const group = segments[0] as string | undefined;
    const inPublicGroup = group ? PUBLIC_GROUPS.includes(group) : false;
    const onLanding = group === undefined; // app/index.tsx

    if (!isAuthenticated) {
      if (!inPublicGroup && !onLanding) router.replace("/login");
      return;
    }

    // Authenticated: keep the user inside the section that matches their role.
    // `(user)` is an invisible group (bare URLs); `recycler`/`admin` are real
    // path segments so no two screens resolve to the same URL.
    const home = homeRouteFor(role, userType);
    const expectedSegment =
      role === "admin" ? "admin" : role === "recycler" ? "recycler" : "(user)";

    if (inPublicGroup || onLanding) {
      router.replace(home as any);
      return;
    }

    const roleSegments = ["(user)", "recycler", "admin"];
    if (group && roleSegments.includes(group) && group !== expectedSegment) {
      router.replace(home as any);
    }
  }, [loading, isAuthenticated, role, userType, segments, router]);
}

function RootNavigator() {
  const { loading } = useAuth();
  useProtectedRoute();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#eef1ee" } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(user)" />
      <Stack.Screen name="recycler" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}

export default function RootLayout() {
  // Load the Fraunces display face before first paint so titles/numerals never
  // flash in the fallback system serif.
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_900Black,
  });

  if (!fontsLoaded) {
    return <View className="flex-1 bg-background" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
          <Toast />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
