import { Modal, Pressable, View } from "react-native";
import { X } from "lucide-react-native";
import { Text } from "./Text";
import { cn } from "@/lib/utils";
import { useColors } from "@/lib/theme";

/**
 * Centered modal dialog. Mirrors shadcn Dialog usage: controlled `open` +
 * `onClose`, with an optional title/description header.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  className,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
  dismissable?: boolean;
}) {
  const c = useColors();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/40 px-6"
        onPress={dismissable ? onClose : undefined}
      >
        <Pressable
          className={cn(
            "w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-clay-lg",
            className
          )}
        >
          {(title || dismissable) && (
            <View className="mb-2 flex-row items-start justify-between">
              <View className="flex-1 pr-2">
                {title ? (
                  <Text variant="h3" className="font-bold">
                    {title}
                  </Text>
                ) : null}
                {description ? (
                  <Text variant="label" className="mt-1 text-muted-foreground">
                    {description}
                  </Text>
                ) : null}
              </View>
              {dismissable ? (
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  className="p-1"
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                >
                  <X size={20} color={c.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          )}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
