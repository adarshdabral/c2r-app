import { View } from "react-native";
import { Text } from "./Text";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

const container: Record<Variant, string> = {
  default: "bg-primary",
  secondary: "bg-secondary",
  outline: "border border-border bg-transparent",
  success: "bg-primary/15",
  warning: "bg-chart-3/15",
  destructive: "bg-destructive/15",
};

const label: Record<Variant, string> = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  outline: "text-foreground",
  success: "text-primary",
  warning: "text-chart-3",
  destructive: "text-destructive",
};

export function Badge({
  variant = "default",
  className,
  textClassName,
  children,
}: {
  variant?: Variant;
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className={cn(
        "self-start rounded-full px-2.5 py-1",
        container[variant],
        className
      )}
    >
      <Text
        className={cn("text-[11px] font-semibold", label[variant], textClassName)}
      >
        {children}
      </Text>
    </View>
  );
}
