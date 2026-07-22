import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { formatDistanceToNow } from "date-fns";
import {
  CalendarClock,
  PackageCheck,
  MapPin,
  Recycle,
  Bell,
  ChevronRight,
  Leaf,
  CheckCircle2,
  KeyRound,
  Truck,
  Clock,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Screen, Text, Surface } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { api, type RewardsSummary, type AuthProfile } from "@/lib/api";
import {
  fetchNotifications,
  getLastSeen,
  countUnread,
  type AppNotification,
  type NotificationTone,
} from "@/lib/notifications";
import { fetchImpact, ecoLevel, type Impact } from "@/lib/impact";
import { TutorialLauncher } from "@/components/TutorialLauncher";
import { resolveTutorialKey } from "@/lib/tutorials";
import { PressableScale } from "@/components/motion/PressableScale";
import { CountUp } from "@/components/motion/CountUp";
import { ProgressRing } from "@/components/motion/ProgressRing";
import { Floaty, Pulse } from "@/components/motion/Ambient";
import { Shimmer } from "@/components/motion/Shimmer";

// Bento: one prominent primary action + a compact trio (breaks the uniform grid).
const PRIMARY_ACTION = {
  icon: CalendarClock,
  label: "Schedule a pickup",
  hint: "Doorstep collection · recycler auto-matched",
  href: "/pickup/new",
  colors: ["#0e9f6e", "#16a34a"],
} as const;

const COMPACT_ACTIONS = [
  // Colors match each destination's flow hue (see src/lib/domains.ts) so the
  // tile you tap is the color that greets you on arrival.
  { icon: PackageCheck, label: "Drop-off", href: "/dropoff", colors: ["#0ea5b7", "#22b8cf"] },
  { icon: MapPin, label: "Find Stores", href: "/stores", colors: ["#4f46e5", "#6366f1"] },
  { icon: Recycle, label: "My Pickups", href: "/pickups", colors: ["#16a34a", "#0e9f6e"] },
] as const;

const TONE_ICON: Record<NotificationTone, { icon: LucideIcon; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: "#1f6b38", bg: "bg-primary/[0.12]" },
  action: { icon: KeyRound, color: "#9a5b00", bg: "bg-chart-3/15" },
  info: { icon: Truck, color: "#2563eb", bg: "bg-accent" },
  muted: { icon: Clock, color: "#6c7278", bg: "bg-muted" },
};

const rel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
};

export default function DashboardScreen() {
  const router = useRouter();
  const { role, userType } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [rewards, setRewards] = useState<RewardsSummary | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [feed, setFeed] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [feedLoading, setFeedLoading] = useState(true);

  // Name once (personalised greeting).
  useEffect(() => {
    api
      .get<AuthProfile>("/auth/profile")
      .then(({ data }) => setFirstName((data.name || "").trim().split(/\s+/)[0] || ""))
      .catch(() => {});
  }, []);

  const loadRewards = useCallback(async () => {
    try {
      const { data } = await api.get<RewardsSummary>("/rewards/me");
      setRewards(data);
    } catch {
      setRewards(null);
    }
  }, []);

  const loadImpact = useCallback(async () => {
    try {
      setImpact(await fetchImpact());
    } catch {
      /* non-critical */
    }
  }, []);

  const loadFeed = useCallback(async () => {
    try {
      const [items, lastSeen] = await Promise.all([fetchNotifications(), getLastSeen()]);
      setFeed(items);
      setUnread(countUnread(items, lastSeen));
    } catch {
      setUnread(0);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRewards();
      loadImpact();
      loadFeed();
    }, [loadRewards, loadImpact, loadFeed])
  );

  const hour = new Date().getHours();
  const daypart = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const greeting = firstName ? `${daypart}, ${firstName}` : `${daypart}`;
  const subheading =
    userType === "bulk_producer"
      ? "Manage your bulk e-waste disposal"
      : userType === "small_business"
        ? "Recycle your business e-waste responsibly"
        : "Small acts, measurable impact";

  const level = ecoLevel(rewards?.points ?? Math.round((impact?.kg ?? 0) * 10));
  const kg = impact?.kg ?? 0;
  const recent = feed.slice(0, 3);

  return (
    <Screen contentClassName="py-5">
      {/* Header */}
      <Animated.View entering={FadeIn.duration(450)}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="font-display text-[27px] leading-[32px] tracking-tight" numberOfLines={1}>
              {greeting}
            </Text>
            <Text className="mt-1 text-[13.5px] text-muted-foreground">{subheading}</Text>
          </View>
          <Pressable
            onPress={() => router.push("/notifications" as any)}
            hitSlop={8}
            className="mt-1 h-11 w-11 items-center justify-center rounded-full bg-card shadow-clay-sm active:opacity-70"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          >
            <Bell size={21} color="#14181a" />
            {unread > 0 ? (
              <View className="absolute -right-0.5 -top-0.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1">
                <Text className="text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </Animated.View>

      {/* Impact hero — the emotional center */}
      <Animated.View entering={FadeInDown.duration(600).delay(90)}>
        <View className="mt-5 overflow-hidden rounded-[28px] shadow-clay">
          <LinearGradient
            colors={["#0b6b3f", "#0f9e6a", "#12b39a"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 22 }}
          >
            {/* Living depth — softly drifting orbs + particles */}
            <Floaty pointerEvents="none" amplitude={14} drift={6} duration={5200} style={{ position: "absolute", right: -40, top: -48 }}>
              <View className="h-44 w-44 rounded-full bg-white/10" />
            </Floaty>
            <Floaty pointerEvents="none" amplitude={11} drift={-8} duration={6400} delay={400} style={{ position: "absolute", left: -32, bottom: -56 }}>
              <View className="h-36 w-36 rounded-full bg-white/[0.06]" />
            </Floaty>
            <Floaty pointerEvents="none" amplitude={9} duration={3600} style={{ position: "absolute", right: 30, bottom: 18 }}>
              <View className="h-1.5 w-1.5 rounded-full bg-white/50" />
            </Floaty>
            <Floaty pointerEvents="none" amplitude={13} duration={4200} delay={700} style={{ position: "absolute", right: 74, top: 26 }}>
              <View className="h-1 w-1 rounded-full bg-white/40" />
            </Floaty>
            <Floaty pointerEvents="none" amplitude={7} duration={5000} delay={1200} style={{ position: "absolute", left: 40, top: 12 }}>
              <View className="h-1 w-1 rounded-full bg-white/30" />
            </Floaty>

            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Leaf size={13} color="rgba(255,255,255,0.9)" />
                  <Text className="text-[11px] font-semibold tracking-[2px] text-white/80">YOUR IMPACT</Text>
                </View>
                <View className="mt-2.5 flex-row items-end gap-1.5">
                  <CountUp
                    value={kg}
                    decimals={Number.isInteger(kg) ? 0 : 1}
                    style={{ color: "#fff", fontSize: 46, fontWeight: "800", letterSpacing: -1.5 }}
                  />
                  <Text className="mb-2.5 text-[16px] font-bold text-white/90">kg</Text>
                </View>
                <Text className="text-[13px] font-medium text-white/80">e-waste recycled</Text>
              </View>

              <View className="items-center justify-center">
                {/* breathing glow behind the ring */}
                <Pulse
                  pointerEvents="none"
                  from={0.9}
                  to={1.12}
                  minOpacity={0.25}
                  duration={2600}
                  style={{ position: "absolute", height: 92, width: 92 }}
                >
                  <View className="h-full w-full rounded-full bg-white/20" />
                </Pulse>
                <ProgressRing progress={level.progress} size={92} stroke={9}>
                  <View className="items-center">
                    <Text className="text-[9px] font-bold tracking-[1.5px] text-white/70">LEVEL</Text>
                    <Text className="font-display-black text-[27px] leading-7 text-white">{level.level}</Text>
                  </View>
                </ProgressRing>
              </View>
            </View>

            <View className="mt-5 flex-row items-center gap-3 border-t border-white/15 pt-4">
              <View className="flex-1">
                <Text className="text-[11px] font-medium text-white/70">Recycles completed</Text>
                <CountUp value={impact?.completed ?? 0} style={{ color: "#fff", fontSize: 19, fontWeight: "800" }} />
              </View>
              {rewards?.enabled ? (
                <PressableScale onPress={() => router.push("/rewards" as any)}>
                  <View className="rounded-2xl bg-white/15 px-3.5 py-2">
                    <Text className="text-[11px] font-medium text-white/80">Reward points</Text>
                    <View className="flex-row items-center gap-1">
                      <CountUp value={rewards.points ?? 0} style={{ color: "#fff", fontSize: 19, fontWeight: "800" }} />
                      <ChevronRight size={15} color="rgba(255,255,255,0.85)" />
                    </View>
                  </View>
                </PressableScale>
              ) : (
                <View className="rounded-2xl bg-white/10 px-3.5 py-2">
                  <Text className="text-[11px] font-medium text-white/70">To next level</Text>
                  <Text className="font-display text-[20px] text-white">{level.toNext}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>
      </Animated.View>

      {/* Guided tour (role/user-type aware; auto-shows once). */}
      <Animated.View entering={FadeInDown.duration(500).delay(180)}>
        <View className="mt-4">
          <TutorialLauncher tutorialKey={resolveTutorialKey(role, userType)} />
        </View>
      </Animated.View>

      {/* Quick actions — bento (one prominent primary + a compact trio) */}
      <Animated.View entering={FadeIn.duration(400).delay(240)}>
        <Text className="mb-3 mt-8 font-display text-[16px]">Quick actions</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(460).delay(280)}>
        <PressableScale onPress={() => router.push(PRIMARY_ACTION.href as any)}>
          <View className="overflow-hidden rounded-3xl shadow-clay">
            <LinearGradient
              colors={PRIMARY_ACTION.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.9 }}
              style={{ padding: 18 }}
            >
              <Floaty pointerEvents="none" amplitude={10} drift={5} duration={4600} style={{ position: "absolute", right: -18, top: -26 }}>
                <View className="h-28 w-28 rounded-full bg-white/10" />
              </Floaty>
              <View className="flex-row items-center gap-4">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                  <PRIMARY_ACTION.icon size={24} color="#fff" strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text className="text-[16px] font-extrabold text-white">{PRIMARY_ACTION.label}</Text>
                  <Text className="mt-0.5 text-[12.5px] text-white/85">{PRIMARY_ACTION.hint}</Text>
                </View>
                <View className="h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <ChevronRight size={18} color="#fff" />
                </View>
              </View>
            </LinearGradient>
          </View>
        </PressableScale>
      </Animated.View>

      <View className="mt-3 flex-row gap-3">
        {COMPACT_ACTIONS.map((a, i) => (
          <View key={a.label} className="flex-1">
            <Animated.View entering={FadeInDown.duration(450).delay(360 + i * 80)}>
              <PressableScale onPress={() => router.push(a.href as any)}>
                <Surface className="items-center px-2 py-4">
                  <View className="h-11 w-11 overflow-hidden rounded-2xl">
                    <LinearGradient
                      colors={a.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
                    >
                      <a.icon size={20} color="#fff" strokeWidth={2.2} />
                    </LinearGradient>
                  </View>
                  <Text className="mt-2.5 text-center text-[12px] font-bold">{a.label}</Text>
                </Surface>
              </PressableScale>
            </Animated.View>
          </View>
        ))}
      </View>

      {/* Recent activity */}
      {feedLoading ? (
        <View>
          <Text className="mb-3 mt-8 font-display text-[16px]">Recent activity</Text>
          <View className="gap-2.5">
            {[0, 1, 2].map((k) => (
              <Surface key={k} variant="inset" className="flex-row items-center gap-3 p-3.5">
                <Shimmer style={{ height: 36, width: 36 }} radius={18} />
                <View className="flex-1 gap-2">
                  <Shimmer style={{ height: 11, width: "55%" }} radius={6} />
                  <Shimmer style={{ height: 10, width: "82%" }} radius={6} />
                </View>
              </Surface>
            ))}
          </View>
        </View>
      ) : recent.length > 0 ? (
        <View>
          <View className="mb-3 mt-8 flex-row items-center justify-between">
            <Text className="font-display text-[16px]">Recent activity</Text>
            <Pressable onPress={() => router.push("/notifications" as any)} hitSlop={8}>
              <Text className="text-[12.5px] font-semibold text-primary">See all</Text>
            </Pressable>
          </View>
          <View className="gap-2.5">
            {recent.map((n, i) => {
              const t = TONE_ICON[n.tone];
              const Icon = t.icon;
              return (
                <Animated.View key={n.id} entering={FadeInDown.duration(420).delay(i * 90)}>
                  <PressableScale onPress={() => router.push(n.href as any)}>
                    <Surface variant="inset" className="flex-row items-center gap-3 p-3.5">
                      <View className={`h-9 w-9 items-center justify-center rounded-full ${t.bg}`}>
                        <Icon size={16} color={t.color} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-[13px] font-semibold" numberOfLines={1}>
                          {n.title}
                        </Text>
                        <Text className="text-[11.5px] text-muted-foreground" numberOfLines={1}>
                          {n.body}
                        </Text>
                      </View>
                      <Text className="text-[10.5px] text-muted-foreground">{rel(n.timestamp)}</Text>
                    </Surface>
                  </PressableScale>
                </Animated.View>
              );
            })}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
