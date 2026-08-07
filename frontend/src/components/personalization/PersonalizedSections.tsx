import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { CalendarHeart, ChevronRight, Leaf, MapPin, Sparkles, Star, TreePine, Zap } from "lucide-react-native";
import { Text, Surface } from "@/components/ui";
import { PressableScale } from "@/components/motion/PressableScale";
import { getPersonalizationHome, type PersonalizationHome } from "@/lib/api";
import { useColors } from "@/lib/theme";

/**
 * History-driven personalization for the user dashboard: a drive reminder,
 * suggested next actions, recommended recyclers near the preferred address, and
 * frequently-recycled categories. Fetched only when the personalization feature
 * is enabled (the parent gates on the flag). Renders nothing until data arrives
 * and hides any section that has no data — so it never leaves an empty shell.
 */
export function PersonalizedSections() {
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

  if (!home) return null;

  const reminder = home.driveReminders?.[0];
  const hasSuggested = (home.suggestedActions?.length ?? 0) > 0;
  const hasRecs = (home.recommendedRecyclers?.length ?? 0) > 0;
  const hasFreq = (home.frequentWasteTypes?.length ?? 0) > 0;
  const ins = home.recyclingInsights;
  if (!reminder && !hasSuggested && !hasRecs && !hasFreq && !ins) return null;

  const go = (href: string) => router.push(href as any);

  return (
    <Animated.View entering={FadeIn.duration(400)} className="mt-8">
      {/* Drive reminder */}
      {reminder ? (
        <PressableScale onPress={() => go("/drives")}>
          <Surface className="mb-4 flex-row items-center gap-3 p-4">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#7c3aed]/[0.14]">
              <CalendarHeart size={19} color="#7c3aed" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[13.5px] font-bold" numberOfLines={1}>
                You're going to {reminder.title}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {reminder.scheduledDate}
                {reminder.timeWindow ? ` · ${reminder.timeWindow}` : ""}
              </Text>
            </View>
            <ChevronRight size={18} color={c.mutedForeground} />
          </Surface>
        </PressableScale>
      ) : null}

      {/* Recycling insights (environmental equivalents of what you've diverted) */}
      {ins ? (
        <View className="mb-5">
          <View className="mb-3 flex-row items-center gap-2">
            <Leaf size={16} color={c.accentForeground} />
            <Text variant="h3">Your recycling impact</Text>
          </View>
          <View className="flex-row gap-2.5">
            <InsightStat icon={Leaf} label="CO₂ avoided" value={`${ins.co2AvoidedKg} kg`} tint={c.accentForeground} />
            <InsightStat icon={TreePine} label="Trees eq." value={`${ins.treesEquivalent}`} tint="#1f7a3d" />
            <InsightStat icon={Zap} label="Energy" value={`${ins.energySavedKwh} kWh`} tint="#e0a422" />
          </View>
        </View>
      ) : null}

      {/* Suggested actions */}
      {hasSuggested ? (
        <View className="mb-5">
          <View className="mb-3 flex-row items-center gap-2">
            <Sparkles size={16} color="#0d9488" />
            <Text variant="h3">Suggested for you</Text>
          </View>
          <View className="gap-2.5">
            {(home.suggestedActions ?? []).map((a) => (
              <PressableScale key={a.key} onPress={() => go(a.href)}>
                <Surface variant="inset" className="flex-row items-center gap-3 p-3.5">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13.5px] font-semibold" numberOfLines={1}>
                      {a.label}
                    </Text>
                    <Text variant="caption" numberOfLines={1}>
                      {a.hint}
                    </Text>
                  </View>
                  <ChevronRight size={17} color={c.mutedForeground} />
                </Surface>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      {/* Recommended recyclers */}
      {hasRecs ? (
        <View className="mb-5">
          <View className="mb-3 flex-row items-center gap-2">
            <MapPin size={16} color="#4f46e5" />
            <Text variant="h3">Recyclers near you</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingRight: 8 }}
          >
            {(home.recommendedRecyclers ?? []).map((s) => (
              <PressableScale key={s.id} onPress={() => go(`/stores/${s.id}`)}>
                <Surface className="w-56 gap-1.5 p-4">
                  <Text className="text-[14px] font-bold" numberOfLines={1}>
                    {s.storeName}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {s.rating != null ? (
                      <View className="flex-row items-center gap-1">
                        <Star size={12} color="#e0a422" fill="#e0a422" />
                        <Text variant="caption">{s.rating.toFixed(1)}</Text>
                      </View>
                    ) : null}
                    {s.distanceKm != null ? (
                      <Text variant="caption">· {s.distanceKm} km</Text>
                    ) : null}
                    {s.city ? <Text variant="caption" numberOfLines={1}>· {s.city}</Text> : null}
                  </View>
                  {s.acceptedWasteTypes?.length ? (
                    <Text variant="caption" numberOfLines={1} className="mt-0.5">
                      Accepts {s.acceptedWasteTypes.slice(0, 2).join(", ")}
                      {s.acceptedWasteTypes.length > 2 ? "…" : ""}
                    </Text>
                  ) : null}
                </Surface>
              </PressableScale>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Bulk suggestion (business/bulk personas) */}
      {home.bulkSuggestion ? (
        <PressableScale onPress={() => go(home.bulkSuggestion!.href)}>
          <Surface variant="inset" className="mb-5 flex-row items-center gap-3 p-3.5">
            <View className="min-w-0 flex-1">
              <Text className="text-[13.5px] font-semibold" numberOfLines={1}>{home.bulkSuggestion.label}</Text>
              <Text variant="caption" numberOfLines={1}>{home.bulkSuggestion.hint}</Text>
            </View>
            <ChevronRight size={17} color={c.mutedForeground} />
          </Surface>
        </PressableScale>
      ) : null}

      {/* Frequently recycled */}
      {hasFreq ? (
        <View className="mb-1">
          <Text variant="h3" className="mb-3">
            You recycle most
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(home.frequentWasteTypes ?? []).map((f) => (
              <View key={f.category} className="rounded-full border border-border bg-card px-3 py-1.5">
                <Text className="text-[12px] font-medium" numberOfLines={1}>
                  {f.category}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

function InsightStat({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Leaf;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <Surface variant="inset" className="flex-1 items-center gap-1 px-2 py-3">
      <Icon size={17} color={tint} />
      <Text className="font-display text-[15px]">{value}</Text>
      <Text variant="caption" numberOfLines={1}>{label}</Text>
    </Surface>
  );
}
