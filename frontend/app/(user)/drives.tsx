import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarHeart } from "lucide-react-native";
import Toast from "react-native-toast-message";
import {
  getDrives,
  getMyDrives,
  rsvpDrive,
  cancelDriveRsvp,
  type CollectionDrive,
} from "@/lib/api";
import { Text, LoadingState, EmptyState } from "@/components/ui";
import { GradientHeader } from "@/components/GradientHeader";
import { DriveCard } from "@/components/drives/DriveCard";
import { DOMAIN } from "@/lib/domains";
import { useLocation } from "@/hooks/useLocation";

type Tab = "near" | "mine";

export default function DrivesScreen() {
  const { coords, request } = useLocation();
  const [tab, setTab] = useState<Tab>("near");
  const [drives, setDrives] = useState<CollectionDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    request();
  }, [request]);

  const load = useCallback(async () => {
    try {
      const data =
        tab === "mine"
          ? await getMyDrives()
          : await getDrives(coords ? { lat: coords.lat, lng: coords.lng } : undefined);
      setDrives(data);
    } catch {
      setDrives([]);
    } finally {
      setLoading(false);
    }
  }, [tab, coords]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleRsvp = async (drive: CollectionDrive) => {
    setBusyId(drive.id);
    try {
      const updated =
        drive.myRsvp === "GOING" ? await cancelDriveRsvp(drive.id) : await rsvpDrive(drive.id);
      Toast.show({
        type: "success",
        text1: updated.myRsvp === "GOING" ? "You're going!" : "RSVP cancelled",
      });
      if (tab === "mine" && updated.myRsvp !== "GOING") {
        setDrives((prev) => prev.filter((d) => d.id !== drive.id));
      } else {
        setDrives((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      }
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.response?.data?.message || "Couldn't update RSVP" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="flex-1 px-5 pt-4">
        <GradientHeader
          eyebrow="COMMUNITY EVENTS"
          title="Collection drives"
          subtitle="Public e-waste events near you — RSVP and drop off in person."
          colors={DOMAIN.drives}
          icon={CalendarHeart}
          className="mb-3"
        />

        <View className="mb-3 flex-row gap-1 rounded-full bg-muted p-1">
          {(["near", "mine"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              className={"flex-1 items-center rounded-full py-2 " + (tab === t ? "bg-card shadow-clay-sm" : "")}
            >
              <Text className={"text-[13px] font-semibold " + (tab === t ? "text-foreground" : "text-muted-foreground")}>
                {t === "near" ? "Near you" : "My events"}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <LoadingState label="Loading events…" />
        ) : drives.length === 0 ? (
          <EmptyState
            icon={CalendarHeart}
            title={tab === "mine" ? "No events yet" : "No drives scheduled"}
            description={
              tab === "mine"
                ? "RSVP to a collection drive and it'll show up here."
                : "Check back soon — recyclers post public collection drives here."
            }
          />
        ) : (
          <FlatList
            data={drives}
            keyExtractor={(d) => String(d.id)}
            renderItem={({ item }) => (
              <DriveCard drive={item} busy={busyId === item.id} onRsvp={() => toggleRsvp(item)} onCancel={() => toggleRsvp(item)} />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
