import { useCallback, useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Toast from "react-native-toast-message";
import { BarChart3, Download, Leaf, TreePine, Zap } from "lucide-react-native";
import {
  getReports,
  generateReportSummary,
  reportDownloadPath,
  type ImpactReport,
} from "@/lib/api";
import { Text, Surface, Button, LoadingState, EmptyState } from "@/components/ui";
import { GradientHeader } from "@/components/GradientHeader";
import { DOMAIN } from "@/lib/domains";
import { getToken } from "@/lib/auth";
import { useColors } from "@/lib/theme";

const PERIODS: { key: "monthly" | "quarterly" | "annual"; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
];

export default function ReportsScreen() {
  const [reports, setReports] = useState<ImpactReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReports(await getReports());
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (type: "monthly" | "quarterly" | "annual") => {
    setGenerating(type);
    try {
      await generateReportSummary(type);
      Toast.show({ type: "success", text1: "Report generated" });
      await load();
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.response?.data?.message || "Couldn't generate report" });
    } finally {
      setGenerating(null);
    }
  };

  const download = async (r: ImpactReport) => {
    try {
      const url = `${process.env.EXPO_PUBLIC_API_URL || ""}${reportDownloadPath(r.id)}`;
      const target = `${FileSystem.cacheDirectory}${r.reportNo}.pdf`;
      const res = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      } else {
        Toast.show({ type: "success", text1: "Report saved", text2: res.uri });
      }
    } catch {
      Toast.show({ type: "error", text1: "Couldn't open the report" });
    }
  };

  const Header = (
    <View>
      <GradientHeader
        eyebrow="ENVIRONMENTAL IMPACT"
        title="Impact reports"
        subtitle="Your e-waste recycling, quantified — download shareable PDFs."
        colors={DOMAIN.impact}
        icon={BarChart3}
        className="mb-3"
      />
      <Surface className="mb-4 gap-3 p-5">
        <Text className="text-[14px] font-bold">Generate a summary</Text>
        <View className="flex-row gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant="outline"
              className="flex-1"
              loading={generating === p.key}
              onPress={() => generate(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </View>
      </Surface>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="flex-1 px-5 pt-4">
        {loading ? (
          <>
            {Header}
            <LoadingState label="Loading reports…" />
          </>
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(r) => String(r.id)}
            ListHeaderComponent={Header}
            ListEmptyComponent={
              <EmptyState
                icon={BarChart3}
                title="No reports yet"
                description="Complete a pickup or generate a summary above to see your impact."
              />
            }
            renderItem={({ item: r }) => <ReportCard report={r} onDownload={() => download(r)} />}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function ReportCard({ report, onDownload }: { report: ImpactReport; onDownload: () => void }) {
  const m = report.metrics;
  return (
    <Surface className="mb-3 gap-3 p-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-display text-[16px] leading-5 tracking-tight">{report.title}</Text>
          <Text className="mt-0.5 text-[11.5px] text-muted-foreground">
            {report.reportNo}
            {report.periodStart ? ` · ${report.periodStart} → ${report.periodEnd}` : ""}
          </Text>
        </View>
        <View className="rounded-full bg-primary/[0.12] px-2.5 py-1">
          <Text className="text-[10px] font-bold uppercase text-primary">{report.reportType}</Text>
        </View>
      </View>

      {m ? (
        <View className="flex-row flex-wrap gap-2">
          <Metric icon={Leaf} label="Recycled" value={`${m.quantityKg} kg`} />
          <Metric icon={Leaf} label="CO₂ avoided" value={`${m.co2AvoidedKg} kg`} />
          <Metric icon={TreePine} label="Trees eq." value={`${m.treesEquivalent}`} />
          <Metric icon={Zap} label="Energy" value={`${m.energySavedKwh} kWh`} />
        </View>
      ) : null}

      <Button size="sm" onPress={onDownload} className="flex-row gap-1.5">
        <Download size={15} color="#fff" />
        <Text className="text-[13px] font-semibold text-primary-foreground">Download PDF</Text>
      </Button>
    </Surface>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Leaf; label: string; value: string }) {
  const c = useColors();
  return (
    <View className="min-w-[46%] grow flex-row items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
      <Icon size={15} color={c.accentForeground} />
      <View>
        <Text className="text-[10px] text-muted-foreground">{label}</Text>
        <Text className="font-display text-[14px]">{value}</Text>
      </View>
    </View>
  );
}
