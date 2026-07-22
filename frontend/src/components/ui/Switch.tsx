import { Switch as RNSwitch, type SwitchProps } from "react-native";

/** Thin wrapper over RN Switch with the brand green track color. */
export function Switch({ value, onValueChange, ...props }: SwitchProps) {
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: "#e4e8e4", true: "#34c759" }}
      thumbColor="#ffffff"
      ios_backgroundColor="#e4e8e4"
      {...props}
    />
  );
}
