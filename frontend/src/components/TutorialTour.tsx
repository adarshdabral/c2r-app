import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Text, Button } from "@/components/ui";
import type { TutorialStep } from "@/lib/tutorials";

/**
 * Full-screen step-by-step onboarding carousel. The parent owns `visible` and
 * supplies the role-specific steps; `onClose` fires on Done, Skip, or the OS
 * back gesture.
 */
export function TutorialTour({
  visible,
  steps,
  onClose,
}: {
  visible: boolean;
  steps: TutorialStep[];
  onClose: () => void;
}) {
  const [i, setI] = useState(0);

  const close = () => {
    setI(0);
    onClose();
  };

  const step = steps[i];
  if (!step) return null;
  const Icon = step.icon;
  const isFirst = i === 0;
  const isLast = i === steps.length - 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="flex-1 px-6">
          {/* Top bar: progress + skip */}
          <View className="h-12 flex-row items-center justify-between">
            <Text className="text-[12px] font-semibold text-muted-foreground">
              {i + 1} / {steps.length}
            </Text>
            <Pressable
              onPress={close}
              hitSlop={8}
              accessibilityLabel="Skip tour"
              className="h-9 flex-row items-center gap-1 rounded-full bg-card px-3"
            >
              <Text className="text-[12px] font-semibold text-muted-foreground">
                Skip
              </Text>
              <X size={14} color="#6c7278" />
            </Pressable>
          </View>

          {/* Slide */}
          <View className="flex-1 items-center justify-center">
            <View className="mb-7 h-20 w-20 items-center justify-center rounded-3xl bg-accent">
              <Icon size={38} color="#1f6b38" strokeWidth={2} />
            </View>
            <Text className="text-center text-[22px] font-extrabold tracking-tight">
              {step.title}
            </Text>
            <Text className="mt-3 text-center text-[14.5px] leading-6 text-muted-foreground">
              {step.body}
            </Text>
          </View>

          {/* Progress dots */}
          <View className="mb-5 flex-row items-center justify-center gap-1.5">
            {steps.map((_, idx) => (
              <View
                key={idx}
                className={
                  "h-1.5 rounded-full " +
                  (idx === i ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30")
                }
              />
            ))}
          </View>

          {/* Controls */}
          <View className="mb-4 flex-row gap-3">
            {!isFirst ? (
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => setI((n) => Math.max(0, n - 1))}
              >
                Back
              </Button>
            ) : null}
            <Button
              className="flex-1"
              onPress={() => (isLast ? close() : setI((n) => n + 1))}
            >
              {isLast ? "Done" : "Next"}
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
