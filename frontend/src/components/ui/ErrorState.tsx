import { View } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import { Text } from "./Text";
import { Button } from "./Button";

/** Consistent error placeholder with an optional retry action. */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View className="items-center justify-center gap-3 px-6 py-16">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
        <TriangleAlert size={26} color="#ff3b30" />
      </View>
      <Text className="text-center text-[16px] font-semibold text-foreground">
        {title}
      </Text>
      {description ? (
        <Text className="text-center text-[13px] text-muted-foreground">
          {description}
        </Text>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onPress={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      ) : null}
    </View>
  );
}
