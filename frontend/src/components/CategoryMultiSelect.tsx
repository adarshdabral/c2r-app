import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "@/components/ui";
import type { WasteType } from "@/lib/api";

/**
 * Chip-based multi-select for e-waste categories. Used when scheduling a pickup
 * (all categories) or a drop-off (limited to the store's accepted types). Tap a
 * chip to toggle it; the parent owns the selected array.
 */
export function CategoryMultiSelect({
  options,
  value,
  onChange,
}: {
  options: WasteType[];
  value: WasteType[];
  onChange: (next: WasteType[]) => void;
}) {
  const toggle = (t: WasteType) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);

  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((t) => {
        const on = value.includes(t);
        return (
          <Pressable
            key={t}
            onPress={() => toggle(t)}
            className={
              "flex-row items-center gap-1.5 rounded-full border px-3 py-2 " +
              (on ? "border-primary bg-primary/[0.12]" : "border-input bg-card")
            }
          >
            {on ? <Check size={13} color="#1f6b38" /> : null}
            <Text
              className={
                "text-[13px] font-medium " +
                (on ? "text-primary" : "text-muted-foreground")
              }
            >
              {t}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
