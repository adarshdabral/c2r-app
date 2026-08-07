import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { CheckCircle2, QrCode } from "lucide-react-native";
import { Dialog, Text, LoadingState } from "@/components/ui";
import { getDriveMyQr } from "@/lib/api";
import { useColors } from "@/lib/theme";

/**
 * The attendee's personal check-in QR for a drive. The organizer scans/enters
 * the encoded token to mark attendance. Fetched on open; loading/error handled.
 */
export function DriveQrModal({
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
  const [qr, setQr] = useState<{ token: string; qrDataUrl: string; checkedIn: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    setQr(null);
    getDriveMyQr(driveId)
      .then(setQr)
      .catch((e: any) => setError(e?.response?.data?.message || "Couldn't load your check-in code"))
      .finally(() => setLoading(false));
  }, [open, driveId]);

  return (
    <Dialog open={open} onClose={onClose} title="Your check-in code" description={driveTitle}>
      {loading ? (
        <LoadingState label="Loading…" />
      ) : error ? (
        <Text className="py-6 text-center text-[13px] text-destructive">{error}</Text>
      ) : qr ? (
        <View className="items-center gap-3 py-2">
          {qr.checkedIn ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-primary/[0.12] px-3 py-1.5">
              <CheckCircle2 size={15} color={c.accentForeground} />
              <Text className="text-[12.5px] font-semibold text-primary">Checked in</Text>
            </View>
          ) : null}
          <View className="overflow-hidden rounded-2xl bg-white p-3">
            <Image source={{ uri: qr.qrDataUrl }} style={{ width: 220, height: 220 }} />
          </View>
          <View className="flex-row items-center gap-1.5">
            <QrCode size={14} color={c.mutedForeground} />
            <Text className="text-[12px] text-muted-foreground">Show this at the drive to check in</Text>
          </View>
          <Text className="text-[11px] tracking-wider text-muted-foreground">{qr.token}</Text>
        </View>
      ) : null}
    </Dialog>
  );
}
