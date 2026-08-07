import { CheckCircle } from "lucide-react-native";
import {
  Text,
  Button,
  Input,
  Field,
  Surface,
  OtpInput,
} from "@/components/ui";

/**
 * The recycler's OTP + actual-quantity "collect" panel — shared by the pickup
 * and drop-off screens (identical mutual-OTP handover UI). The only copy that
 * differs between the two flows is the quantity verb ("collected" vs
 * "received"), parameterised via `quantityVerb`.
 */
export function CollectPanel({
  declaredQty,
  otp,
  qty,
  busy,
  onOtp,
  onQty,
  onSubmit,
  quantityVerb = "collected",
}: {
  declaredQty: number;
  otp: string;
  qty: string;
  busy: boolean;
  onOtp: (v: string) => void;
  onQty: (v: string) => void;
  onSubmit: () => void;
  quantityVerb?: string;
}) {
  const disabled = busy || otp.length < 6 || qty === "" || Number(qty) < 0;
  return (
    <Surface variant="inset" className="gap-3 p-4">
      <Text className="text-[14px] font-bold">Verify &amp; collect</Text>
      <Text className="text-[12px] text-muted-foreground">
        Ask the customer for the OTP shown on their dashboard, then log the
        actual quantity {quantityVerb} (declared: {declaredQty} kg).
      </Text>
      <Field label="Customer OTP">
        <OtpInput value={otp} onChange={onOtp} length={6} autoFocus={false} />
      </Field>
      <Field label="Actual quantity (kg)">
        <Input
          keyboardType="decimal-pad"
          placeholder="Actual kg"
          value={qty}
          onChangeText={onQty}
        />
      </Field>
      <Button
        size="sm"
        onPress={onSubmit}
        loading={busy}
        disabled={disabled}
        className="flex-row gap-1.5 self-start"
      >
        <CheckCircle size={14} color="#fff" />
        <Text className="text-[13px] font-semibold text-primary-foreground">
          Complete
        </Text>
      </Button>
    </Surface>
  );
}
