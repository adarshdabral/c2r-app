import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("rounded-xl bg-muted", className)}
      {...props}
    />
  );
}
