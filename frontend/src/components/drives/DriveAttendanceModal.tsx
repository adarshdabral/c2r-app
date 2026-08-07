import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import Toast from "react-native-toast-message";
import { CheckCircle2, Users } from "lucide-react-native";
import { Dialog, Text, Surface, Button, Input, LoadingState, EmptyState } from "@/components/ui";
import {
  getDriveAnalytics,
  getDriveAttendees,
  checkInDrive,
  type DriveAnalytics,
  type DriveAttendee,
} from "@/lib/api";
import { useColors } from "@/lib/theme";

/**
 * Organizer attendance panel: per-drive analytics + an attendee list with
 * one-tap check-in, plus a token field to check in by scanned QR code.
 */
export function DriveAttendanceModal({
  driveId,
  driveTitle,
  open,
  onClose,
}: {
  driveId: number;
  driveTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const [analytics, setAnalytics] = useState<DriveAnalytics | null>(null);
  const [attendees, setAttendees] = useState<DriveAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | "token" | null>(null);
  const [token, setToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, list] = await Promise.all([getDriveAnalytics(driveId), getDriveAttendees(driveId)]);
      setAnalytics(a);
      setAttendees(list);
    } catch {
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [driveId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const checkIn = async (body: { userId?: number; token?: string }, key: number | "token") => {
    setBusy(key);
    try {
      const res = await checkInDrive(driveId, body);
      Toast.show({
        type: "success",
        text1: res.alreadyCheckedIn ? "Already checked in" : "Checked in",
      });
      if (key === "token") setToken("");
      await load();
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.response?.data?.message || "Check-in failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Attendance" description={driveTitle} className="max-h-[85%]">
      {loading ? (
        <LoadingState label="Loading…" />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {analytics ? (
            <View className="mb-4 flex-row gap-2">
              <Stat label="Going" value={String(analytics.going)} />
              <Stat label="Checked in" value={String(analytics.checkedIn)} />
              <Stat label="Attendance" value={`${analytics.attendanceRate}%`} />
              <Stat label="Capacity" value={analytics.capacity != null ? `${analytics.capacityUsedPct}%` : "—"} />
            </View>
          ) : null}

          {/* Check in by scanned token */}
          <View className="mb-4 gap-2">
            <Text variant="caption">Check in by code</Text>
            <View className="flex-row gap-2">
              <Input
                value={token}
                onChangeText={setToken}
                placeholder="Paste attendee code"
                autoCapitalize="characters"
                className="flex-1"
              />
              <Button
                size="sm"
                disabled={!token.trim()}
                loading={busy === "token"}
                onPress={() => checkIn({ token: token.trim() }, "token")}
              >
                Check in
              </Button>
            </View>
          </View>

          {attendees.length === 0 ? (
            <EmptyState icon={Users} title="No attendees yet" />
          ) : (
            <View className="gap-2">
              {attendees.map((a) => (
                <Surface key={a.userId} variant="inset" className="flex-row items-center gap-3 p-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13px] font-semibold" numberOfLines={1}>{a.name}</Text>
                    <Text variant="caption" numberOfLines={1}>{a.email}</Text>
                  </View>
                  {a.checkedIn ? (
                    <View className="flex-row items-center gap-1">
                      <CheckCircle2 size={16} color={c.accentForeground} />
                      <Text className="text-[12px] font-semibold text-primary">In</Text>
                    </View>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === a.userId}
                      onPress={() => checkIn({ userId: a.userId }, a.userId)}
                      className="px-3"
                    >
                      Check in
                    </Button>
                  )}
                </Surface>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Surface variant="inset" className="flex-1 items-center gap-0.5 px-1 py-2.5">
      <Text className="font-display text-[16px]">{value}</Text>
      <Text variant="caption" className="text-[10px]">{label}</Text>
    </Surface>
  );
}
