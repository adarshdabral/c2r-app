import type { ReactNode } from "react";
import { View } from "react-native";
import { format } from "date-fns";
import { CalendarDays, MapPin, Users } from "lucide-react-native";
import { Text, Surface, Button } from "@/components/ui";
import type { CollectionDrive } from "@/lib/api";

const STATUS: Record<string, { bg: string; fg: string }> = {
  UPCOMING: { bg: "bg-primary/[0.12]", fg: "text-primary" },
  ONGOING: { bg: "bg-chart-3/15", fg: "text-chart-3" },
  COMPLETED: { bg: "bg-muted", fg: "text-muted-foreground" },
  CANCELLED: { bg: "bg-destructive/10", fg: "text-destructive" },
};

const fmtDate = (d: string) => {
  const parsed = new Date(`${d}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? d : format(parsed, "EEE, MMM d, yyyy");
};

/** Reusable collection-drive card. Pass `onRsvp`/`onCancel` to show the RSVP CTA;
 *  pass `children` for host controls. */
export function DriveCard({
  drive,
  onRsvp,
  onCancel,
  busy,
  children,
}: {
  drive: CollectionDrive;
  onRsvp?: () => void;
  onCancel?: () => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  const s = STATUS[drive.status] ?? STATUS.UPCOMING;
  const going = drive.myRsvp === "GOING";
  const closed = drive.status === "COMPLETED" || drive.status === "CANCELLED";
  const Row = ({ icon: Icon, text }: { icon: typeof MapPin; text: string }) => (
    <View className="flex-row items-start gap-2">
      <Icon size={14} color="#7c3aed" style={{ marginTop: 1 }} />
      <Text className="flex-1 text-[12.5px] text-muted-foreground">{text}</Text>
    </View>
  );

  return (
    <Surface className="mb-3 gap-3 p-5">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 font-display text-[18px] leading-6 tracking-tight">{drive.title}</Text>
        <View className={`rounded-full px-2.5 py-1 ${s.bg}`}>
          <Text className={`text-[10px] font-bold ${s.fg}`}>{drive.status}</Text>
        </View>
      </View>

      {drive.description ? (
        <Text className="text-[13px] leading-5 text-muted-foreground" numberOfLines={3}>
          {drive.description}
        </Text>
      ) : null}

      <View className="gap-1.5">
        <Row icon={CalendarDays} text={fmtDate(drive.scheduledDate) + (drive.timeWindow ? ` · ${drive.timeWindow}` : "")} />
        <Row icon={MapPin} text={drive.address + (drive.distanceKm != null ? `  ·  ${drive.distanceKm} km away` : "")} />
        <Row
          icon={Users}
          text={
            `${drive.goingCount ?? 0}${drive.capacity ? `/${drive.capacity}` : ""} going` +
            (drive.hostName ? `  ·  Host: ${drive.hostName}` : "")
          }
        />
      </View>

      {drive.acceptedCategories.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {drive.acceptedCategories.map((c) => (
            <View key={c} className="rounded-full bg-[#7c3aed]/[0.1] px-2.5 py-1">
              <Text className="text-[11px] font-medium text-[#7c3aed]">{c}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {onRsvp ? (
        going ? (
          <Button variant="outline" onPress={onCancel} loading={busy}>
            <Text className="text-[13px] font-semibold text-destructive">Cancel RSVP</Text>
          </Button>
        ) : (
          <Button onPress={onRsvp} loading={busy} disabled={closed}>
            {closed ? "RSVP closed" : "RSVP"}
          </Button>
        )
      ) : null}

      {children}
    </Surface>
  );
}
