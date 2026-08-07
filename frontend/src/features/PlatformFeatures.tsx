import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import Toast from "react-native-toast-message";
import { Bot, Gift, Sparkles, ToggleRight } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { getAdminFeatures, setAdminFeature, type AdminFeatureFlag } from "@/lib/api";
import { Text, Surface, Switch, LoadingState, ErrorState } from "@/components/ui";
import { useFeatures } from "@/context/FeatureContext";
import { useColors } from "@/lib/theme";

// Per-feature icon (falls back to a generic toggle for future features).
const FEATURE_ICON: Record<string, LucideIcon> = {
  personalization: Sparkles,
  rewards: Gift,
  chatbot: Bot,
};

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/**
 * Admin → Settings → Platform Features. DB-backed feature management: each card
 * shows name, description, live status, an enable/disable toggle, and who last
 * changed it + when. Toggling persists to the server (single source of truth)
 * and refreshes the app-wide feature context so changes apply immediately.
 */
export function PlatformFeatures() {
  const c = useColors();
  const { refresh } = useFeatures();
  const [flags, setFlags] = useState<AdminFeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFlags(await getAdminFeatures());
      setError("");
    } catch {
      setError("Could not load platform features.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (flag: AdminFeatureFlag, next: boolean) => {
    setSaving(flag.key);
    // Optimistic flip.
    setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, enabled: next } : f)));
    try {
      const { features } = await setAdminFeature(flag.key, next);
      setFlags(features);
      await refresh(); // propagate to the whole app immediately
      Toast.show({ type: "success", text1: `${flag.name} ${next ? "enabled" : "disabled"}` });
    } catch (e: any) {
      setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, enabled: !next } : f))); // revert
      Toast.show({ type: "error", text1: e?.response?.data?.message || "Couldn't update feature" });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <LoadingState label="Loading features…" />;
  if (error) return <ErrorState description={error} onRetry={load} />;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <ToggleRight size={16} color={c.foreground} />
        <Text variant="h3">Platform Features</Text>
      </View>
      <Text variant="caption" className="-mt-1">
        Enable or disable platform features for everyone. Changes take effect immediately.
      </Text>

      {flags.map((f) => {
        const Icon = FEATURE_ICON[f.key] || ToggleRight;
        return (
          <Surface key={f.key} className="gap-3 p-5">
            <View className="flex-row items-start justify-between gap-4">
              <View className="min-w-0 flex-1 flex-row items-start gap-3">
                <View
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: (f.enabled ? c.primary : c.mutedForeground) + "22" }}
                >
                  <Icon size={20} color={f.enabled ? c.primary : c.mutedForeground} strokeWidth={2} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[15px] font-bold">{f.name}</Text>
                  {f.description ? (
                    <Text variant="caption" className="mt-0.5">
                      {f.description}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Switch value={f.enabled} onValueChange={(v) => toggle(f, v)} disabled={saving === f.key} />
            </View>

            <View className="flex-row items-center justify-between border-t border-border pt-3">
              <View className="flex-row items-center gap-2">
                <View
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: f.enabled ? c.primary : c.mutedForeground }}
                />
                <Text variant="caption" className="font-medium">
                  {f.enabled ? "Enabled" : "Disabled"}
                </Text>
              </View>
              <Text variant="caption">
                {fmtWhen(f.updatedAt)} · by {f.updatedByName || "System"}
              </Text>
            </View>
          </Surface>
        );
      })}
    </View>
  );
}
