import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import Toast from "react-native-toast-message";
import {
  Award,
  CalendarHeart,
  Flame,
  Gift,
  Globe,
  Leaf,
  Medal,
  Sprout,
  Trophy,
  TrendingUp,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useFeature } from "@/context/FeatureContext";
import {
  getRewards,
  getRewardHistory,
  getRewardBadges,
  getRewardCatalog,
  getRewardLeaderboard,
  redeemReward,
  type RewardsSummary,
  type RewardHistoryEntry,
  type RewardBadge,
  type RewardCatalogItem,
  type LeaderboardRow,
} from "@/lib/api";
import { Text, Surface, Button, LoadingState, EmptyState, ErrorState } from "@/components/ui";
import { GradientHeader } from "@/components/GradientHeader";
import { ProgressRing } from "@/components/motion/ProgressRing";
import { DOMAIN } from "@/lib/domains";
import { useColors } from "@/lib/theme";

const BADGE_ICONS: Record<string, LucideIcon> = {
  Sprout,
  CalendarHeart,
  Flame,
  Leaf,
  Award,
  Globe,
};
const TIER_COLOR: Record<string, string> = {
  bronze: "#b0722f",
  silver: "#8a94a6",
  gold: "#e0a422",
  platinum: "#4f8bd6",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const EVENT_LABELS: Record<string, string> = {
  recycle_completed: "Recycled e-waste",
  pickup_scheduled: "Scheduled a pickup",
  drive_joined: "Joined a drive",
  profile_completed: "Completed profile",
  bulk_recycle: "Bulk recycling bonus",
  streak_bonus: "Streak bonus",
  redeem: "Redeemed a reward",
  admin_grant: "Bonus points",
  admin_deduct: "Adjustment",
  expire: "Points expired",
};

/**
 * Rewards screen — points, level & streak, earned badges, a redeemable catalog,
 * the leaderboard, and the local reward ledger. Gated by the rewards feature
 * flag (route guard) and the admin operational toggle (enabled:false state).
 */
export default function RewardsScreen() {
  const c = useColors();
  const rewardsEnabled = useFeature("rewards");
  const [summary, setSummary] = useState<RewardsSummary | null>(null);
  const [history, setHistory] = useState<RewardHistoryEntry[]>([]);
  const [badges, setBadges] = useState<RewardBadge[]>([]);
  const [catalog, setCatalog] = useState<RewardCatalogItem[]>([]);
  const [board, setBoard] = useState<{ leaderboard: LeaderboardRow[]; me: LeaderboardRow | null }>({
    leaderboard: [],
    me: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, h, b, cat, lb] = await Promise.all([
        getRewards(),
        getRewardHistory(),
        getRewardBadges().catch(() => []),
        getRewardCatalog().catch(() => ({ catalog: [], balance: 0 })),
        getRewardLeaderboard().catch(() => ({ leaderboard: [], me: null })),
      ]);
      setSummary(s);
      setHistory(h);
      setBadges(b);
      setCatalog(cat.catalog);
      setBoard(lb);
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

  const redeem = async (item: RewardCatalogItem) => {
    setRedeeming(item.code);
    try {
      const r = await redeemReward(item.code);
      Toast.show({ type: "success", text1: "Redeemed!", text2: `Voucher ${r.voucherCode}` });
      await load();
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.response?.data?.message || "Couldn't redeem" });
    } finally {
      setRedeeming(null);
    }
  };

  if (!rewardsEnabled) return <Redirect href="/dashboard" />;
  if (loading) return <LoadingState label="Loading your rewards…" />;
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (summary && !summary.enabled) {
    return (
      <EmptyState
        icon={Award}
        title="Rewards unavailable"
        description="The rewards programme isn't active right now. Check back later."
      />
    );
  }

  const points = summary?.pointsBalance ?? summary?.points ?? 0;
  const level = summary?.level ?? 1;
  const streak = summary?.streakCount ?? 0;
  const progress = summary?.progress ?? 0;
  const toNext = summary?.toNext ?? 0;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Balance + level + streak */}
      <GradientHeader
        eyebrow="REWARDS"
        title={`${points.toLocaleString()} points`}
        subtitle={toNext > 0 ? `${toNext} to level ${level + 1}` : "Top level reached"}
        colors={DOMAIN.rewards}
        icon={Award}
        right={
          <ProgressRing progress={progress} size={64} stroke={7}>
            <View className="items-center">
              <Text className="text-[8px] font-bold tracking-[1px] text-white/80">LVL</Text>
              <Text className="font-display-black text-[18px] leading-5 text-white">{level}</Text>
            </View>
          </ProgressRing>
        }
      />

      <View className="mt-3 flex-row gap-3">
        <Surface variant="inset" className="flex-1 flex-row items-center gap-2.5 p-3.5">
          <Flame size={18} color="#e0662a" />
          <View>
            <Text variant="caption">Streak</Text>
            <Text className="font-display text-[17px]">{streak} day{streak === 1 ? "" : "s"}</Text>
          </View>
        </Surface>
        <Surface variant="inset" className="flex-1 flex-row items-center gap-2.5 p-3.5">
          <Award size={18} color={c.accentForeground} />
          <View>
            <Text variant="caption">Lifetime</Text>
            <Text className="font-display text-[17px]">{(summary?.lifetimePoints ?? points).toLocaleString()}</Text>
          </View>
        </Surface>
      </View>

      {/* Badges */}
      {badges.length > 0 ? (
        <View className="mt-7">
          <SectionTitle icon={Medal} label="Badges" />
          <View className="mt-3 flex-row flex-wrap gap-3">
            {badges.map((b) => {
              const Icon = (b.icon && BADGE_ICONS[b.icon]) || Award;
              const tint = TIER_COLOR[b.tier] || c.mutedForeground;
              return (
                <View key={b.code} className="w-[30%] items-center">
                  <View
                    className="h-14 w-14 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: b.earned ? tint + "22" : c.muted, opacity: b.earned ? 1 : 0.55 }}
                  >
                    <Icon size={24} color={b.earned ? tint : c.mutedForeground} strokeWidth={2} />
                  </View>
                  <Text
                    className="mt-1.5 text-center text-[11px] font-semibold"
                    numberOfLines={1}
                    style={{ opacity: b.earned ? 1 : 0.6 }}
                  >
                    {b.name}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Redeemable catalog */}
      {catalog.length > 0 ? (
        <View className="mt-7">
          <SectionTitle icon={Gift} label="Redeem points" />
          <View className="mt-3 gap-2.5">
            {catalog.map((item) => {
              const affordable = points >= item.pointsCost;
              return (
                <Surface key={item.code} className="flex-row items-center gap-3 p-3.5">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-chart-3/15">
                    <Gift size={18} color="#e0a422" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13.5px] font-semibold" numberOfLines={1}>{item.name}</Text>
                    <Text variant="caption" numberOfLines={1}>{item.pointsCost.toLocaleString()} pts</Text>
                  </View>
                  <Button
                    size="sm"
                    variant={affordable ? "default" : "outline"}
                    disabled={!affordable}
                    loading={redeeming === item.code}
                    onPress={() => redeem(item)}
                    className="px-4"
                  >
                    {affordable ? "Redeem" : "Locked"}
                  </Button>
                </Surface>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Leaderboard */}
      {board.leaderboard.length > 0 ? (
        <View className="mt-7">
          <SectionTitle icon={Trophy} label="Leaderboard" />
          <View className="mt-3 gap-2">
            {board.leaderboard.slice(0, 5).map((row) => {
              const isMe = board.me && row.userId === board.me.userId;
              return (
                <Surface
                  key={row.userId}
                  variant={isMe ? "clay" : "inset"}
                  className={`flex-row items-center gap-3 p-3 ${isMe ? "border-primary" : ""}`}
                >
                  <Text className="w-6 text-center font-display text-[15px]">{row.rank}</Text>
                  <Text className="min-w-0 flex-1 text-[13.5px] font-semibold" numberOfLines={1}>
                    {row.name}{isMe ? " (you)" : ""}
                  </Text>
                  <Text variant="caption">{row.lifetimePoints.toLocaleString()} pts</Text>
                </Surface>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Ledger history */}
      <View className="mt-7">
        <SectionTitle icon={TrendingUp} label="Activity" />
        {history.length === 0 ? (
          <Text variant="caption" className="mt-2">
            Complete a pickup or drop-off to start earning points.
          </Text>
        ) : (
          <View className="mt-3 gap-2">
            {history.slice(0, 30).map((e) => (
              <Surface key={e.id} variant="inset" className="flex-row items-center justify-between p-3.5">
                <View className="min-w-0 flex-1 pr-3">
                  <Text className="text-[13px] font-semibold" numberOfLines={1}>
                    {EVENT_LABELS[e.eventType] || e.reason || e.eventType}
                  </Text>
                  <Text variant="caption">{fmtDate(e.createdAt)} · balance {e.balanceAfter.toLocaleString()}</Text>
                </View>
                <Text
                  className="font-display text-[15px]"
                  style={{ color: e.delta >= 0 ? c.accentForeground : c.destructive }}
                >
                  {e.delta >= 0 ? "+" : ""}
                  {e.delta}
                </Text>
              </Surface>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  const c = useColors();
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={16} color={c.foreground} />
      <Text variant="h3">{label}</Text>
    </View>
  );
}
