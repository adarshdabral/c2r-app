import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronRight, GraduationCap } from "lucide-react-native";
import { Text, Surface } from "@/components/ui";
import { TutorialTour } from "@/components/TutorialTour";
import {
  TUTORIALS,
  hasSeenTutorial,
  markTutorialSeen,
  type TutorialKey,
} from "@/lib/tutorials";

/**
 * Home-screen entry point for a role's guided tour. Renders a tappable banner
 * ("take the tour") and auto-opens the tour ONCE per role/user_type on first
 * login (tracked in AsyncStorage). Tapping the banner always reopens it.
 */
export function TutorialLauncher({
  tutorialKey,
  className,
}: {
  tutorialKey: TutorialKey;
  className?: string;
}) {
  const tut = TUTORIALS[tutorialKey];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    hasSeenTutorial(tutorialKey).then((seen) => {
      if (active && !seen) setVisible(true);
    });
    return () => {
      active = false;
    };
  }, [tutorialKey]);

  const close = () => {
    setVisible(false);
    markTutorialSeen(tutorialKey);
  };

  if (!tut) return null;

  return (
    <>
      <Pressable
        className={`${className ?? ""} active:opacity-80`}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={tut.banner.title}
      >
        <Surface className="flex-row items-center gap-3 bg-primary/[0.06] p-4">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary">
            <GraduationCap size={22} color="#fff" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-bold">{tut.banner.title}</Text>
            <Text className="mt-0.5 text-[12.5px] leading-4 text-muted-foreground">
              {tut.banner.subtitle}
            </Text>
          </View>
          <ChevronRight size={20} color="#6c7278" />
        </Surface>
      </Pressable>

      <TutorialTour visible={visible} steps={tut.steps} onClose={close} />
    </>
  );
}
