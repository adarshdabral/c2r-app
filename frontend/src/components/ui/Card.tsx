import { View, type ViewProps } from "react-native";
import { Text } from "./Text";
import { Surface } from "./Surface";
import { cn } from "@/lib/utils";

/**
 * Clay surface card — thin alias over <Surface variant="clay"> so there's one
 * elevated-panel implementation. The Card.* sub-components add the standard
 * header/title/content/footer spacing on top.
 */
export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return <Surface className={className} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return <View className={cn("p-5 pb-2", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: { className?: string; children?: React.ReactNode }) {
  return (
    <Text
      className={cn("text-[17px] font-bold text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: { className?: string; children?: React.ReactNode }) {
  return (
    <Text
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return <View className={cn("p-5 pt-2", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("flex-row items-center p-5 pt-0", className)}
      {...props}
    />
  );
}
