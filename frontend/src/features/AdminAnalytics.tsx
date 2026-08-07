import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Toast from "react-native-toast-message";
import {
  Bot,
  Download,
  Gift,
  Leaf,
  Recycle,
  Store,
  TrendingUp,
  Users,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import {
  getAnalyticsDashboard,
  analyticsExportPath,
  type AnalyticsDashboard,
  type SeriesPoint,
} from "@/lib/api";
import { Text, Surface, Button, LoadingState, ErrorState } from "@/components/ui";
import { useColors } from "@/lib/theme";
import { getToken } from "@/lib/auth";

const ROLE_TINT: Record<string, string> = { user: "#16a34a", recycler: "#0d9488", admin: "#4f46e5" };

export function AdminAnalytics() {
  const c = useColors();
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getAnalyticsDashboard());
      setError("");
    } catch {
      setError("Couldn't load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const url = `${process.env.EXPO_PUBLIC_API_URL || ""}${analyticsExportPath()}`;
      const target = `${FileSystem.cacheDirectory}platform-analytics.csv`;
      const res = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri, { mimeType: "text/csv" });
      else Toast.show({ type: "success", text1: "Saved", text2: res.uri });
    } catch {
      Toast.show({ type: "error", text1: "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingState label="Loading analytics…" />;
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!data) return null;

  const roleTotal = data.roles.reduce((n, r) => n + r.count, 0) || 1;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* KPI grid */}
      <View className="flex-row flex-wrap gap-2.5">
        <Kpi icon={Users} label="Users" value={data.health.users} tint="#16a34a" />
        <Kpi icon={TrendingUp} label="Active today" value={data.activeUsers.dau} tint="#0d9488" />
        <Kpi icon={TrendingUp} label="Active (30d)" value={data.activeUsers.mau} tint="#4f46e5" />
        <Kpi icon={Store} label="Recyclers" value={data.health.recyclers} tint="#7c3aed" />
        <Kpi icon={Leaf} label="Recycled kg" value={data.volume.totalKg} tint="#1f7a3d" />
        <Kpi icon={Recycle} label="Completed" value={data.volume.completed} tint="#16a34a" />
        <Kpi icon={Gift} label="Pts earned" value={data.rewards.pointsEarned ?? 0} tint="#e0a422" />
        <Kpi icon={Bot} label="Chat msgs" value={data.chatbot.messages} tint="#0d9488" />
      </View>

      {/* User growth chart */}
      <ChartCard title="New users (14 days)" series={data.growth} tint="#16a34a" c={c} />
      {/* Pickups chart */}
      <ChartCard title="Pickups (14 days)" series={data.pickups} tint="#0d9488" c={c} />

      {/* Role distribution */}
      <Surface className="mt-4 gap-3 p-5">
        <Text variant="h3">Role distribution</Text>
        {data.roles.map((r) => (
          <View key={r.role} className="gap-1">
            <View className="flex-row justify-between">
              <Text className="text-[13px] font-semibold capitalize">{r.role}</Text>
              <Text variant="caption">{r.count} · {Math.round((r.count / roleTotal) * 100)}%</Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-muted">
              <View
                style={{ width: `${Math.round((r.count / roleTotal) * 100)}%`, backgroundColor: ROLE_TINT[r.role] || c.primary }}
                className="h-full rounded-full"
              />
            </View>
          </View>
        ))}
      </Surface>

      {/* Feature usage */}
      <Surface className="mt-4 gap-2.5 p-5">
        <Text variant="h3">Feature usage</Text>
        {data.features.map((f) => (
          <View key={f.key} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: f.enabled ? c.primary : c.mutedForeground }} />
              <Text className="text-[13px] font-medium">{f.name}</Text>
            </View>
            <Text variant="caption">
              {f.enabled ? "On" : "Off"}
              {f.usage != null ? ` · ${f.usage} uses` : ""}
            </Text>
          </View>
        ))}
      </Surface>

      <Button onPress={exportCsv} loading={exporting} className="mt-5 flex-row gap-2 self-start px-5">
        <Download size={16} color="#fff" />
        <Text className="text-[14px] font-semibold text-primary-foreground">Export CSV</Text>
      </Button>
    </ScrollView>
  );
}

function Kpi({ icon: Icon, label, value, tint }: { icon: LucideIcon; label: string; value: number; tint: string }) {
  return (
    <Surface className="min-w-[46%] grow items-start gap-1.5 p-4">
      <Icon size={18} color={tint} />
      <Text className="font-display text-[22px]">{typeof value === "number" ? value.toLocaleString() : value}</Text>
      <Text variant="caption">{label}</Text>
    </Surface>
  );
}

function ChartCard({ title, series, tint, c }: { title: string; series: SeriesPoint[]; tint: string; c: any }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <Surface className="mt-4 gap-3 p-5">
      <Text variant="h3">{title}</Text>
      {series.length === 0 ? (
        <Text variant="caption">No data in this period yet.</Text>
      ) : (
        <View className="h-28 flex-row items-end gap-1">
          {series.map((s) => (
            <View key={s.day} className="flex-1 items-center justify-end">
              <View
                style={{ height: `${Math.max(4, Math.round((s.count / max) * 100))}%`, backgroundColor: tint }}
                className="w-full rounded-t-md"
              />
            </View>
          ))}
        </View>
      )}
    </Surface>
  );
}
