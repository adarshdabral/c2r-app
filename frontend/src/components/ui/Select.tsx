import { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { Text } from "./Text";
import { cn } from "@/lib/utils";
import { useColors } from "@/lib/theme";

export type SelectOption<T extends string = string> = {
  label: string;
  value: T;
};

/**
 * Native select — a trigger that opens a bottom-sheet-style modal list. Mirrors
 * shadcn's <Select value onValueChange/> so screen logic ports unchanged.
 */
export function Select<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  className,
  disabled,
}: {
  value: T | null | undefined;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const c = useColors();

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? selected.label : placeholder}
        className={cn(
          "min-h-12 flex-row items-center justify-between rounded-full border border-input bg-card px-4 py-2.5",
          disabled && "opacity-50",
          className
        )}
      >
        <Text
          className={cn(
            "text-body-lg",
            selected ? "text-foreground" : "text-muted-foreground"
          )}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={18} color={c.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setOpen(false)}
        >
          <Pressable className="max-h-[70%] rounded-t-3xl bg-card p-2 pb-8">
            <View className="items-center py-2">
              <View className="h-1 w-10 rounded-full bg-muted" />
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onValueChange(item.value);
                      setOpen(false);
                    }}
                    className="flex-row items-center justify-between rounded-xl px-4 py-3.5 active:bg-muted"
                  >
                    <Text
                      className={cn(
                        "text-body-lg",
                        active ? "font-semibold text-primary" : "text-foreground"
                      )}
                    >
                      {item.label}
                    </Text>
                    {active ? <Check size={18} color={c.primary} /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
