import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { Camera, ImagePlus, X } from "lucide-react-native";
import { Text } from "@/components/ui";
import { PressableScale } from "@/components/motion/PressableScale";
import { useColors } from "@/lib/theme";
import { pickImages, takePhoto } from "@/lib/imagePicker";

/**
 * Local image picker with previews for the booking flow. Holds data URLs in the
 * parent's state; the parent uploads them after the request is created.
 */
export function ImageUploader({
  images,
  onChange,
  max = 8,
  hint = "Add clear photos of the e-waste.",
}: {
  images: string[];
  onChange: (next: string[]) => void;
  max?: number;
  hint?: string;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const full = images.length >= max;

  const add = async (mode: "library" | "camera") => {
    if (full || busy) return;
    setBusy(true);
    try {
      const picked =
        mode === "camera" ? [await takePhoto()].filter(Boolean) as string[] : await pickImages(max - images.length);
      if (picked.length) onChange([...images, ...picked].slice(0, max));
    } finally {
      setBusy(false);
    }
  };

  const remove = (idx: number) => onChange(images.filter((_, i) => i !== idx));

  return (
    <View className="gap-3">
      <View className="flex-row gap-2.5">
        <PressableScale onPress={() => add("library")} disabled={full || busy}>
          <View
            className={
              "flex-row items-center gap-2 rounded-2xl border border-dashed px-4 py-3 " +
              (full ? "border-border opacity-50" : "border-primary/40 bg-primary/[0.06]")
            }
          >
            <ImagePlus size={18} color={c.accentForeground} />
            <Text className="text-[13px] font-semibold text-primary">Add photos</Text>
          </View>
        </PressableScale>
        <PressableScale
          onPress={() => add("camera")}
          disabled={full || busy}
          accessibilityLabel="Take photo"
        >
          <View
            className={
              "h-[46px] w-[46px] items-center justify-center rounded-2xl border " +
              (full ? "border-border opacity-50" : "border-input bg-card")
            }
          >
            <Camera size={18} color={c.foreground} />
          </View>
        </PressableScale>
      </View>

      {images.length > 0 ? (
        <View className="flex-row flex-wrap gap-2.5">
          {images.map((uri, idx) => (
            <View key={idx} className="overflow-hidden rounded-xl">
              <Image source={{ uri }} style={{ width: 72, height: 72 }} />
              <Pressable
                onPress={() => remove(idx)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                className="absolute right-1 top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60"
              >
                <X size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Text className="text-[11.5px] text-muted-foreground">
        {hint} {images.length}/{max}
      </Text>
    </View>
  );
}
