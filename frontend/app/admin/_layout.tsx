import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";

export default function AdminLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    />
  );
}
