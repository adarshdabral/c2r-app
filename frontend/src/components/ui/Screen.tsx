import { ScrollView, View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";

type ScreenProps = ViewProps & {
  className?: string;
  contentClassName?: string;
  /** Wrap children in a ScrollView (default true). */
  scroll?: boolean;
  edges?: readonly Edge[];
};

/**
 * Screen wrapper — SafeArea + tinted background canvas, optionally scrollable.
 * Replaces the web app's full-height `min-h-screen bg-background` containers.
 */
export function Screen({
  className,
  contentClassName,
  scroll = true,
  edges = ["top", "left", "right"],
  children,
  ...props
}: ScreenProps) {
  return (
    <SafeAreaView
      edges={edges}
      className={cn("flex-1 bg-background", className)}
      {...props}
    >
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={cn("px-5 py-4", contentClassName)}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className={cn("flex-1 px-5 py-4", contentClassName)}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}
