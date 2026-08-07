import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { Inbox, MapPin, Navigation, Recycle, Star } from "lucide-react-native";
import { Text, Surface } from "@/components/ui";
import { PressableScale } from "@/components/motion/PressableScale";
import { getPersonalizationHome, type PersonalizationHome } from "@/lib/api";
import { useColors } from "@/lib/theme";

/**
 * Recycler-facing personalization: live pickup demand, business stats, a
 * proximity-ordered route for accepted jobs, and open requests nearby. Fetched
 * only when the personalization feature is on (parent gates the flag). Renders
 * nothing until the recycler bundle arrives.
 */
export function RecyclerInsights() {
  const router = useRouter();
  const c = useColors();
  const [home, setHome] = useState<PersonalizationHome | null>(null);

  useEffect(() => {
    let alive = true;
    getPersonalizationHome()
      .then((h) => alive && setHome(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!home || !home.businessStats) return null;
  const b = home.businessStats;
  const route = home.routeSuggestions ?? [];
  const open = home.nearbyRequests ?? [];

  return (
    <Animated.View entering={FadeIn.duration(400)} className="mt-6">
      {/* KPI row */}
      <View className="mb-3 flex-row items-center gap-2">
        <Recycle size={16} color={c.foreground} />
        <Text variant="h3">Your business</Text>
      </View>
      <View className="flex-row gap-2.5">
        <Kpi icon={Inbox} label="Open demand" value={String(home.pickupDemand ?? 0)} tint="#e0662a" />
        <Kpi icon={Recycle} label="Processed" value={`${b.totalKg} kg`} tint={c.accentForeground} />
        <Kpi icon={Star} label="Rating" value={b.avgRating ? b.avgRating.toFixed(1) : "—"} tint="#e0a422" />
        <Kpi icon={MapPin} label="Stores" value={`${b.verified}/${b.stores}`} tint="#4f46e5" />
      </View>

      {/* Route suggestions */}
      {route.length > 0 ? (
        <View className="mt-5">
          <View className="mb-3 flex-row items-center gap-2">
            <Navigation size={16} color="#0d9488" />
            <Text variant="h3">Today's route</Text>
          </View>
          <View className="gap-2">
            {route.map((stop, i) => (
              <PressableScale key={stop.id} onPress={() => router.push("/recycler/pickups" as any)}>
                <Surface variant="inset" className="flex-row items-center gap-3 p-3.5">
                  <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/[0.12]">
                    <Text className="font-display text-[13px] text-primary">{i + 1}</Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-semibold" numberOfLines={1}>{stop.address}</Text>
                    <Text variant="caption" numberOfLines={1}>
                      {stop.wasteCategory} · {stop.status}
                      {stop.distanceKm != null ? ` · ${stop.distanceKm} km` : ""}
                    </Text>
                  </View>
                </Surface>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      {/* Open requests nearby */}
      {open.length > 0 ? (
        <View className="mt-5">
          <View className="mb-3 flex-row items-center gap-2">
            <Inbox size={16} color="#e0662a" />
            <Text variant="h3">Open requests near you</Text>
          </View>
          <View className="gap-2">
            {open.map((r) => (
              <PressableScale key={r.id} onPress={() => router.push("/recycler/pickups" as any)}>
                <Surface variant="inset" className="flex-row items-center gap-3 p-3.5">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-semibold" numberOfLines={1}>{r.address}</Text>
                    <Text variant="caption" numberOfLines={1}>
                      {r.wasteCategory}
                      {r.distanceKm != null ? ` · ${r.distanceKm} km away` : ""}
                    </Text>
                  </View>
                  <Text className="text-[12px] font-bold text-primary">Accept →</Text>
                </Surface>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <Surface variant="inset" className="flex-1 items-center gap-1 px-1.5 py-3">
      <Icon size={16} color={tint} />
      <Text className="font-display text-[15px]" numberOfLines={1}>{value}</Text>
      <Text variant="caption" numberOfLines={1} className="text-[10px]">{label}</Text>
    </Surface>
  );
}
