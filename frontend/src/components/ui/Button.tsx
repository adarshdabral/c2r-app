import { ActivityIndicator, Pressable, type PressableProps } from "react-native";
import { Text } from "./Text";
import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "outline"
  | "ghost"
  | "destructive"
  | "secondary";
type Size = "default" | "sm" | "lg" | "icon";

const containerBase =
  "flex-row items-center justify-center rounded-full active:opacity-80";

const containerVariant: Record<Variant, string> = {
  default: "bg-primary",
  secondary: "bg-secondary",
  outline: "border border-input bg-card",
  ghost: "bg-transparent",
  destructive: "bg-destructive",
};

const containerSize: Record<Size, string> = {
  default: "h-12 px-5",
  sm: "h-9 px-4",
  lg: "h-14 px-6",
  icon: "h-11 w-11",
};

const labelVariant: Record<Variant, string> = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  destructive: "text-destructive-foreground",
};

const spinnerColor: Record<Variant, string> = {
  default: "#ffffff",
  secondary: "#3a4046",
  outline: "#14181a",
  ghost: "#14181a",
  destructive: "#ffffff",
};

export type ButtonProps = PressableProps & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
  textClassName?: string;
  /** String children render as the button label; nodes render as-is. */
  children?: React.ReactNode;
};

export function Button({
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  className,
  textClassName,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={cn(
        containerBase,
        containerVariant[variant],
        containerSize[size],
        isDisabled && "opacity-50",
        className
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor[variant]} />
      ) : typeof children === "string" ? (
        <Text
          className={cn(
            "text-[15px] font-semibold",
            labelVariant[variant],
            textClassName
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
