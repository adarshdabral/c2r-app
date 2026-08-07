import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import {
  Bot,
  CalendarHeart,
  Gift,
  History,
  PackageCheck,
  Recycle,
  Search,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { formatDistanceToNow } from "date-fns";
import { getActivity, type ActivityItem } from "@/lib/api";
import { Text, Surface, EmptyState, ErrorState } from "@/components/ui";
import { GradientHeader } from "@/components/GradientHeader";
import { Shimmer } from "@/components/motion/Shimmer";
import { useFeature } from "@/context/FeatureContext";
import { useColors } from "@/lib/theme";

const SOURCE_META: Record<string, { icon: LucideIcon; tint: string; label: string }> = {
  pickup: { icon: Recycle, tint: "#16a34a", label: "Pickups" },
  dropoff: { icon: PackageCheck, tint: "#0ea5b7", label: "Drop-offs" },
  reward: { icon: Gift, tint: "#e0a422", label: "Rewards" },
  drive: { icon: CalendarHeart, tint: "#7c3aed", label: "Drives" },
  chatbot: { icon: Bot, tint: "#0d9488", label: "Assistant" },
};

const PAGE = 20;
const rel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
};

export default function ActivityScreen() {
  const c = useColors();
  const enabled = useFeature("activity");
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [source, setSource] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (opts: { source?: string; search?: string; page: number; append: boolean }) => {
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await getActivity({ source: opts.source, search: opts.search, page: opts.page, limit: PAGE });
        setItems((prev) => (opts.append ? [...prev, ...res.activity] : res.activity));
        setSources(res.sources);
        setTotal(res.meta.total);
        setError("");
      } catch {
        if (!opts.append) setError("Couldn't load your activity.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Initial + filter changes.
  useEffect(() => {
    setPage(1);
    load({ source, search: search.trim() || undefined, page: 1, append: false });
  }, [source, load]);

  // Debounced search.
  const onSearch = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      load({ source, search: text.trim() || undefined, page: 1, append: false });
    }, 350);
  };

  const loadMore = () => {
    if (loadingMore || items.length >= total) return;
    const next = page + 1;
    setPage(next);
    load({ source, search: search.trim() || undefined, page: next, append: true });
  };

  if (!enabled) return <Redirect href="/dashboard" />;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="flex-1 px-5 pt-4">
        <GradientHeader
          eyebrow="TIMELINE"
          title="Activity history"
          subtitle="Everything you've done across the platform."
          colors={["#334155", "#475569"]}
          icon={History}
          className="mb-3"
        />

        {/* Search */}
        <View className="mb-3 flex-row items-center gap-2 rounded-full border border-input bg-card px-4">
          <Search size={16} color={c.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={onSearch}
            placeholder="Search activity…"
            placeholderTextColor={c.mutedForeground}
            className="flex-1 py-2.5 text-[14px] text-foreground"
          />
        </View>

        {/* Source filter chips */}
        <View className="mb-3 flex-row flex-wrap gap-2">
          <Chip label="All" active={!source} onPress={() => setSource(undefined)} />
          {sources.map((s) => (
            <Chip key={s} label={SOURCE_META[s]?.label || s} active={source === s} onPress={() => setSource(s)} />
          ))}
        </View>

        {loading ? (
          <View className="gap-2.5">
            {[0, 1, 2, 3, 4].map((k) => (
              <Surface key={k} variant="inset" className="flex-row items-center gap-3 p-3.5">
                <Shimmer style={{ height: 34, width: 34 }} radius={17} />
                <View className="flex-1 gap-2">
                  <Shimmer style={{ height: 11, width: "50%" }} radius={6} />
                  <Shimmer style={{ height: 10, width: "78%" }} radius={6} />
                </View>
              </Surface>
            ))}
          </View>
        ) : error ? (
          <ErrorState description={error} onRetry={() => load({ source, search, page: 1, append: false })} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(a, i) => `${a.source}-${a.refId}-${i}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            ListEmptyComponent={
              <EmptyState icon={History} title="No activity yet" description="Your platform activity will show up here." />
            }
            renderItem={({ item }) => {
              const meta = SOURCE_META[item.source] || { icon: History, tint: c.mutedForeground, label: item.source };
              const Icon = meta.icon;
              return (
                <Surface variant="inset" className="mb-2.5 flex-row items-center gap-3 p-3.5">
                  <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: meta.tint + "22" }}>
                    <Icon size={16} color={meta.tint} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-semibold" numberOfLines={1}>{item.title}</Text>
                    {item.description ? (
                      <Text variant="caption" numberOfLines={1}>{item.description}</Text>
                    ) : null}
                  </View>
                  <Text variant="caption" className="text-[10.5px]">{rel(item.at)}</Text>
                </Surface>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={"rounded-full px-3.5 py-1.5 " + (active ? "bg-primary" : "bg-muted")}
    >
      <Text className={"text-[12.5px] font-semibold " + (active ? "text-primary-foreground" : "text-muted-foreground")}>
        {label}
      </Text>
    </Pressable>
  );
}
