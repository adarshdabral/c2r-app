import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  AlertTriangle,
  Award,
  Bot,
  ChevronLeft,
  ChevronRight,
  Gift,
  Megaphone,
  Settings2,
  Sparkles,
  ToggleRight,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { api, type AdminSettings as AdminSettingsData } from "@/lib/api";
import { Text, Card, Surface, Switch, LoadingState, ErrorState, EmptyState } from "@/components/ui";
import { PressableScale } from "@/components/motion/PressableScale";
import { PlatformFeatures } from "@/features/PlatformFeatures";
import { AdminBroadcast } from "@/features/AdminBroadcast";
import { useColors } from "@/lib/theme";

/**
 * Admin → Settings, structured for scale. A menu routes into per-module settings
 * pages so each module can grow its own configuration over time:
 *
 *   Settings
 *   ├── Platform Features   (enable/disable modules — the only cross-module control)
 *   ├── Rewards             (activation toggle today; more config later)
 *   ├── Personalization     (placeholder)
 *   └── AI Chatbot          (placeholder)
 */
type Page = "menu" | "features" | "announcements" | "rewards" | "personalization" | "chatbot";

const MENU: { key: Page; title: string; subtitle: string; icon: LucideIcon }[] = [
  { key: "features", title: "Platform Features", subtitle: "Enable or disable platform modules", icon: ToggleRight },
  { key: "announcements", title: "Announcements", subtitle: "Broadcast an in-app notification", icon: Megaphone },
  { key: "rewards", title: "Rewards", subtitle: "Reward programme activation & settings", icon: Gift },
  { key: "personalization", title: "Personalization", subtitle: "Recommendations & personalization settings", icon: Sparkles },
  { key: "chatbot", title: "AI Chatbot", subtitle: "Assistant behaviour & settings", icon: Bot },
];

export function AdminSettings() {
  const c = useColors();
  const [page, setPage] = useState<Page>("menu");

  if (page !== "menu") {
    const meta = MENU.find((m) => m.key === page)!;
    return (
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => setPage("menu")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
          className="mb-3 flex-row items-center gap-1 self-start"
        >
          <ChevronLeft size={18} color={c.mutedForeground} />
          <Text variant="label" className="text-muted-foreground">Settings</Text>
        </Pressable>
        <Text variant="h2" className="mb-4">{meta.title}</Text>

        {page === "features" ? <PlatformFeatures /> : null}
        {page === "announcements" ? <AdminBroadcast /> : null}
        {page === "rewards" ? <RewardsSettings /> : null}
        {page === "personalization" ? (
          <ModulePlaceholder module="Personalization" />
        ) : null}
        {page === "chatbot" ? <ModulePlaceholder module="AI Chatbot" /> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View className="mb-3 flex-row items-center gap-2">
        <Settings2 size={16} color={c.foreground} />
        <Text variant="h3">Settings</Text>
      </View>
      <View className="gap-2.5">
        {MENU.map((m) => (
          <PressableScale key={m.key} onPress={() => setPage(m.key)}>
            <Surface className="flex-row items-center gap-3 p-4">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.12]">
                <m.icon size={19} color={c.primary} strokeWidth={2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[14.5px] font-bold">{m.title}</Text>
                <Text variant="caption" numberOfLines={1}>{m.subtitle}</Text>
              </View>
              <ChevronRight size={18} color={c.mutedForeground} />
            </Surface>
          </PressableScale>
        ))}
      </View>
    </ScrollView>
  );
}

/* ------- Rewards module settings (existing operational activation toggle) ------- */
function RewardsSettings() {
  const c = useColors();
  const [settings, setSettings] = useState<AdminSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get<AdminSettingsData>("/admin/settings")
      .then(({ data }) => setSettings(data))
      .catch(() => setError("Could not load settings."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (next: boolean) => {
      if (!settings) return;
      setSaving(true);
      setError("");
      setSettings({ ...settings, rewardsEnabled: next });
      try {
        await api.patch("/admin/settings/rewards", { enabled: next });
      } catch (e: any) {
        setSettings({ ...settings, rewardsEnabled: !next });
        setError(e?.response?.data?.message || "Could not update the setting.");
      } finally {
        setSaving(false);
      }
    },
    [settings]
  );

  if (loading) return <LoadingState label="Loading…" />;
  if (error && !settings) return <ErrorState description={error} onRetry={load} />;
  if (!settings) return <EmptyState title="No settings" />;

  return (
    <Card>
      <View className="gap-4 p-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1 flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
              <Award size={20} color={c.accentForeground} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-bold">Reward points activation</Text>
              <Text variant="caption" className="mt-0.5">
                When on, users earn reward points for every completed pickup and drop-off and can see
                their balance, badges, and history. When off, no points are awarded. (To hide the whole
                module, disable it under Platform Features.)
              </Text>
            </View>
          </View>
          <Switch value={settings.rewardsEnabled} onValueChange={toggle} disabled={saving} />
        </View>

        <View className="flex-row items-center gap-2 border-t border-border pt-3">
          <View
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: settings.rewardsEnabled ? c.primary : c.mutedForeground }}
          />
          <Text variant="caption" className="font-medium">
            {settings.rewardsEnabled ? "Active" : "Inactive"}
          </Text>
        </View>

        {!settings.rewardsConfigured ? (
          <View className="flex-row items-start gap-2 rounded-xl bg-chart-3/10 px-3.5 py-3">
            <AlertTriangle size={15} color="#e0a422" />
            <Text className="flex-1 text-[12px] text-chart-3">
              The rewards ledger isn't configured on the server (REWARDS_LEDGER_URL /
              REWARDS_LEDGER_API_KEY). Points are still tracked locally; the on-chain mirror stays off
              until it's set.
            </Text>
          </View>
        ) : null}

        {error ? <Text className="text-[12.5px] font-medium text-destructive">{error}</Text> : null}
      </View>
    </Card>
  );
}

/* ------- Placeholder for modules whose settings aren't built yet ------- */
function ModulePlaceholder({ module }: { module: string }) {
  return (
    <EmptyState
      icon={Settings2}
      title={`${module} settings`}
      description={`Configuration options for ${module} will live here. For now, enable or disable the module under Platform Features.`}
    />
  );
}
