import { useEffect, useState } from "react";
import { Image, Linking, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Text } from "@/components/ui";
import { PressableScale } from "@/components/motion/PressableScale";
import { getSiteContent, absoluteMediaUrl, type SiteMediaItem } from "@/lib/api";

/**
 * Published home carousel (admin-managed via the CMS). Renders nothing when
 * there are no active items, so it's safe to mount unconditionally. Best-effort:
 * a fetch failure simply hides the section.
 */
export function FeaturedCarousel() {
  const [items, setItems] = useState<SiteMediaItem[]>([]);
  const [heading, setHeading] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const cardW = Math.min(280, width - 72);

  useEffect(() => {
    let alive = true;
    getSiteContent()
      .then((c) => {
        if (!alive) return;
        setItems(c.carousel || []);
        setHeading(c.settings.hero_heading?.text ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(450)} className="mt-8">
      <Text className="mb-3 font-display text-[16px]">{heading || "Featured"}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingRight: 8 }}
        snapToInterval={cardW + 12}
        decelerationRate="fast"
      >
        {items.map((it) => {
          const uri = absoluteMediaUrl(it.mediaUrl);
          const open = () => {
            if (it.linkUrl) Linking.openURL(it.linkUrl).catch(() => {});
          };
          return (
            <PressableScale
              key={it.id}
              onPress={open}
              disabled={!it.linkUrl}
              accessibilityLabel={it.title || "Featured item"}
            >
              <View
                style={{ width: cardW }}
                className="overflow-hidden rounded-3xl bg-card shadow-clay-sm"
              >
                {uri ? (
                  <Image source={{ uri }} style={{ width: cardW, height: cardW * 0.56 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: cardW, height: cardW * 0.56 }} className="bg-muted" />
                )}
                {it.title ? (
                  <View className="px-4 py-3">
                    <Text className="text-[13.5px] font-semibold" numberOfLines={2}>
                      {it.title}
                    </Text>
                  </View>
                ) : null}
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}
