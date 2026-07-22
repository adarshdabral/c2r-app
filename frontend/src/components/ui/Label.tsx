import { Text } from "./Text";
import { cn } from "@/lib/utils";
import type { TextProps } from "react-native";

export function Label({
  className,
  ...props
}: TextProps & { className?: string }) {
  return (
    <Text
      className={cn("text-[13px] font-semibold text-foreground", className)}
      {...props}
    />
  );
}
