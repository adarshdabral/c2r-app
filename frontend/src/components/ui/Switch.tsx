import { Switch as RNSwitch, type SwitchProps } from "react-native";
import { useColors } from "@/lib/theme";

/** Thin wrapper over RN Switch with the brand green track color (theme-aware). */
export function Switch({ value, onValueChange, ...props }: SwitchProps) {
  const c = useColors();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: c.input, true: c.primary }}
      thumbColor={c.card}
      ios_backgroundColor={c.input}
      {...props}
    />
  );
}
