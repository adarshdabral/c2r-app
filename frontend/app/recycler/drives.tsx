import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { CalendarHeart, Download, FileSpreadsheet, LocateFixed, Plus } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Toast from "react-native-toast-message";
import {
  getHostingDrives,
  createDrive,
  setDriveStatus,
  driveReportDownloadPath,
  type CollectionDrive,
  type DriveStatus,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Text, Surface, Button, Input, Field, LoadingState, EmptyState } from "@/components/ui";
import { GradientHeader } from "@/components/GradientHeader";
import { PressableScale } from "@/components/motion/PressableScale";
import { DriveCard } from "@/components/drives/DriveCard";
import { DOMAIN } from "@/lib/domains";
import { useColors } from "@/lib/theme";
import { useLocation } from "@/hooks/useLocation";

export default function RecyclerDrivesScreen() {
  const c = useColors();
  const { coords, request } = useLocation();
  const [drives, setDrives] = useState<CollectionDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  // form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [timeWindow, setTimeWindow] = useState("");
  const [capacity, setCapacity] = useState("");
  const [categories, setCategories] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setDrives(await getHostingDrives());
    } catch {
      setDrives([]);
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

  const attachLocation = async () => {
    const loc = coords ?? (await request());
    if (loc) {
      setPin({ ...loc });
      Toast.show({ type: "success", text1: "Location attached" });
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAddress("");
    setDate(null);
    setTimeWindow("");
    setCapacity("");
    setCategories("");
    setPin(null);
  };

  const submit = async () => {
    if (!title.trim() || !address.trim() || !date) {
      Toast.show({ type: "error", text1: "Title, address and date are required" });
      return;
    }
    setSaving(true);
    try {
      await createDrive({
        title: title.trim(),
        description: description.trim() || undefined,
        address: address.trim(),
        scheduledDate: format(date, "yyyy-MM-dd"),
        timeWindow: timeWindow.trim() || undefined,
        capacity: capacity ? Number(capacity) : undefined,
        acceptedCategories: categories
          ? categories.split(",").map((c) => c.trim()).filter(Boolean)
          : undefined,
        latitude: pin?.lat ?? null,
        longitude: pin?.lng ?? null,
      });
      Toast.show({ type: "success", text1: "Drive created" });
      resetForm();
      setShowForm(false);
      await load();
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.response?.data?.message || "Couldn't create drive" });
    } finally {
      setSaving(false);
    }
  };

  const downloadReport = async (id: number, format: "pdf" | "xls") => {
    try {
      const base = process.env.EXPO_PUBLIC_API_URL || "";
      const url = `${base}${driveReportDownloadPath(id, format)}`;
      const target = `${FileSystem.cacheDirectory}drive-${id}-report.${format === "xls" ? "xls" : "pdf"}`;
      const res = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, {
          mimeType: format === "xls" ? "application/vnd.ms-excel" : "application/pdf",
        });
      } else {
        Toast.show({ type: "success", text1: "Report saved", text2: res.uri });
      }
    } catch {
      Toast.show({ type: "error", text1: "Couldn't open the report" });
    }
  };

  const changeStatus = async (id: number, status: DriveStatus) => {
    setBusyId(id);
    try {
      const updated = await setDriveStatus(id, status);
      setDrives((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.response?.data?.message || "Couldn't update" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaScroll refreshing={refreshing} onRefresh={onRefresh}>
      <GradientHeader
        eyebrow="HOST"
        title="Your collection drives"
        subtitle="Host public e-waste events and manage RSVPs."
        colors={DOMAIN.drives}
        icon={CalendarHeart}
        right={
          <PressableScale
            onPress={() => setShowForm((v) => !v)}
            accessibilityLabel={showForm ? "Close new drive form" : "New drive"}
          >
            <View className="flex-row items-center gap-1.5 rounded-full bg-white/20 px-3 py-2">
              <Plus size={15} color="#fff" />
              <Text className="text-[12.5px] font-semibold text-white">New</Text>
            </View>
          </PressableScale>
        }
      />

      {showForm ? (
        <Surface className="mt-3 gap-3.5 p-5">
          <Text className="text-[15px] font-bold">New drive</Text>
          <Field label="Title">
            <Input placeholder="e.g. MG Road E-Waste Drive" value={title} onChangeText={setTitle} />
          </Field>
          <Field label="Description">
            <Input placeholder="What to bring, why…" value={description} onChangeText={setDescription} multiline />
          </Field>
          <Field label="Address">
            <Input placeholder="Venue address" value={address} onChangeText={setAddress} />
          </Field>
          <Field label="Date">
            <Pressable
              onPress={() => setShowPicker(true)}
              className="h-12 justify-center rounded-full border border-input bg-card px-4"
            >
              <Text className={"text-[15px] " + (date ? "text-foreground" : "text-muted-foreground")}>
                {date ? format(date, "EEE, MMM d, yyyy") : "Select a date"}
              </Text>
            </Pressable>
          </Field>
          {showPicker ? (
            <DateTimePicker
              value={date ?? new Date()}
              mode="date"
              minimumDate={new Date()}
              onChange={(e, d) => {
                setShowPicker(Platform.OS === "ios");
                if (e.type === "set" && d) setDate(d);
                if (e.type === "dismissed") setShowPicker(false);
              }}
            />
          ) : null}
          <Field label="Time window (optional)">
            <Input placeholder="e.g. 10:00 – 16:00" value={timeWindow} onChangeText={setTimeWindow} />
          </Field>
          <Field label="Capacity (optional)">
            <Input placeholder="Max attendees" keyboardType="number-pad" value={capacity} onChangeText={setCapacity} />
          </Field>
          <Field label="Accepted categories (optional, comma-separated)">
            <Input placeholder="Laptops, Batteries, Phones" value={categories} onChangeText={setCategories} />
          </Field>
          <Button variant="outline" onPress={attachLocation} className="flex-row gap-1.5">
            <LocateFixed size={15} color={c.foreground} />
            <Text className="text-[13px] font-semibold">
              {pin ? "Location attached ✓" : "Attach my location (for distance)"}
            </Text>
          </Button>
          <View className="flex-row gap-2.5">
            <Button variant="outline" className="flex-1" onPress={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onPress={submit} loading={saving}>
              Create drive
            </Button>
          </View>
        </Surface>
      ) : null}

      <View className="mt-3">
        {loading ? (
          <LoadingState label="Loading your drives…" />
        ) : drives.length === 0 ? (
          <EmptyState
            icon={CalendarHeart}
            title="No drives yet"
            description="Host your first collection drive with the New button above."
          />
        ) : (
          drives.map((d) => (
            <DriveCard key={d.id} drive={d}>
              {d.status === "UPCOMING" || d.status === "ONGOING" ? (
                <View className="flex-row flex-wrap gap-2">
                  {d.status === "UPCOMING" ? (
                    <Button size="sm" variant="outline" loading={busyId === d.id} onPress={() => changeStatus(d.id, "ONGOING")}>
                      Start
                    </Button>
                  ) : null}
                  <Button size="sm" loading={busyId === d.id} onPress={() => changeStatus(d.id, "COMPLETED")}>
                    Complete
                  </Button>
                  <Button size="sm" variant="outline" loading={busyId === d.id} onPress={() => changeStatus(d.id, "CANCELLED")}>
                    <Text className="text-[13px] font-semibold text-destructive">Cancel</Text>
                  </Button>
                </View>
              ) : d.status === "COMPLETED" ? (
                <View className="gap-2">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-accent-foreground">Drive report</Text>
                  <View className="flex-row gap-2">
                    <Button size="sm" onPress={() => downloadReport(d.id, "pdf")} className="flex-row gap-1.5">
                      <Download size={14} color="#fff" />
                      <Text className="text-[13px] font-semibold text-primary-foreground">PDF</Text>
                    </Button>
                    <Button size="sm" variant="outline" onPress={() => downloadReport(d.id, "xls")} className="flex-row gap-1.5">
                      <FileSpreadsheet size={14} color={c.foreground} />
                      <Text className="text-[13px] font-semibold">Excel</Text>
                    </Button>
                  </View>
                </View>
              ) : null}
            </DriveCard>
          ))
        )}
      </View>
    </SafeAreaScroll>
  );
}

// Small scroll wrapper matching the app's screen padding.
function SafeAreaScroll({
  children,
  refreshing,
  onRefresh,
}: {
  children: React.ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
