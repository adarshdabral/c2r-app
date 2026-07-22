import { View } from "react-native";
import { Text } from "./Text";
import { Label } from "./Label";
import { cn } from "@/lib/utils";

/**
 * Form field wrapper: label + control + validation/error message. Mirrors the
 * spacing the web forms used (space-y-2) and shows an inline destructive error.
 */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label?: string;
  error?: string | null;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <View className={cn("gap-2", className)}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {error ? (
        <Text className="text-[12px] font-medium text-destructive">{error}</Text>
      ) : hint ? (
        <Text className="text-[12px] text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}
