import { Text as RNText, type TextProps } from "react-native";
import { cn } from "@/lib/utils";

/**
 * Themed Text — defaults to the foreground color so screens don't have to
 * repeat it. Pass className to override (NativeWind).
 */
export function Text({ className, ...props }: TextProps & { className?: string }) {
  return <RNText className={cn("text-foreground", className)} {...props} />;
}
