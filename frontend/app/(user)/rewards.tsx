import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { Award, ShieldCheck, TrendingUp } from "lucide-react-native";
import {
  api,
  type RewardsSummary,
  type RewardHistoryEntry,
} from "@/lib/api";
import {
  Text,
  Surface,
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/ui";

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const shortTx = (txId: string) =>
  txId.length > 14 ? `${txId.slice(0, 8)}…${txId.slice(-4)}` : txId;

/**
 * User rewards screen: current points balance + the tamper-evident on-chain
 * history from the Hyperledger Fabric ledger. Every row is a committed ledger
 * transaction (txId + block timestamp). Rendered only when the admin has the
 * rewards feature enabled — the backend returns `enabled:false` otherwise and
 * this screen shows a friendly "unavailable" state.
 */
export default function RewardsScreen() {
  const [summary, setSummary] = useState<RewardsSummary | null>(null);
  const [history, setHistory] = useState<RewardHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [{ data: s }, { data: h }] = await Promise.all([
        api.get<RewardsSummary>("/rewards/me"),
        api.get<{ enabled: boolean; history: RewardHistoryEntry[] }>(
          "/rewards/me/history"
        ),
      ]);
      setSummary(s);
      setHistory(Array.isArray(h.history) ? h.history : []);
      setError("");
    } catch {
      setError("Could not load your rewards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return <LoadingState label="Loading your rewards…" />;
  }

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  // Feature turned off by admin — the backend reports enabled:false.
  if (summary && !summary.enabled) {
    return (
      <EmptyState
        icon={Award}
        title="Rewards unavailable"
        description="The rewards programme isn't active right now. Check back later."
      />
    );
  }

  const points = summary?.points ?? 0;

  return (
    <FlatList
      data={history}
      keyExtractor={(e) => e.txId}
      contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListHeaderComponent={
        <View>
          {/* Balance card */}
          <Surface className="overflow-hidden">
            <View className="items-center bg-primary px-5 py-7">
              <View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-white/20">
                <Award size={26} color="#fff" strokeWidth={2.2} />
              </View>
              <Text className="text-[13px] font-medium text-primary-foreground/90">
                Your reward points
              </Text>
              <Text className="font-display-black text-[46px] leading-[54px] text-primary-foreground">
                {points.toLocaleString()}
              </Text>
            </View>
          </Surface>

          {/* Trust note */}
          <View className="mt-3 flex-row items-center gap-2 px-1">
            <ShieldCheck size={14} color="#1f6b38" />
            <Text className="flex-1 text-[12px] text-muted-foreground">
              Every point is recorded on a private blockchain ledger — a
              tamper-evident history you can audit below.
            </Text>
          </View>

          <View className="mb-2 mt-6 flex-row items-center gap-2">
            <TrendingUp size={16} color="#14181a" />
            <Text className="text-[15px] font-bold">On-chain history</Text>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <Surface variant="inset" className="mb-2.5 flex-row items-center justify-between p-4">
          <View className="min-w-0 flex-1 pr-3">
            <Text className="text-[13.5px] font-semibold">
              Balance: {item.points.toLocaleString()} pts
            </Text>
            <Text className="mt-0.5 text-[11.5px] text-muted-foreground">
              {fmtDateTime(item.timestamp)} · tx {shortTx(item.txId)}
            </Text>
          </View>
        </Surface>
      )}
      ListEmptyComponent={
        <EmptyState
          icon={Award}
          title="No activity yet"
          description="Complete a pickup or drop-off to start earning reward points."
        />
      }
    />
  );
}
