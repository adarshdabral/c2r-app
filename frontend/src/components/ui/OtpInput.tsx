import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Text } from "./Text";
import { cn } from "@/lib/utils";

/**
 * Segmented OTP entry. A single hidden TextInput captures numeric input (so
 * SMS autofill / paste works) while N boxes render the digits. Mirrors the web
 * OTP field: numeric-only, fixed length, one-time-code autocomplete.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split("");

  return (
    <Pressable onPress={() => inputRef.current?.focus()}>
      <View className="flex-row justify-between gap-2">
        {Array.from({ length }).map((_, i) => {
          const active = focused && i === value.length;
          return (
            <View
              key={i}
              className={cn(
                "h-14 flex-1 items-center justify-center rounded-2xl border bg-card",
                active ? "border-primary" : "border-input"
              )}
            >
              <Text className="text-[22px] font-bold text-foreground">
                {digits[i] ?? ""}
              </Text>
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Visually hidden but focusable/accessible.
        className="absolute h-14 w-full opacity-0"
      />
    </Pressable>
  );
}
