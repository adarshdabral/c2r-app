import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";
import { useColors } from "@/lib/theme";

export type InputProps = TextInputProps & { className?: string };

/**
 * Text input styled to match the web app's rounded clay inputs. Uses the
 * muted-foreground color for the placeholder (theme-aware). `min-h` (not fixed
 * `h`) so the field grows with OS font-size settings instead of clipping.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, ...props },
  ref
) {
  const c = useColors();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.mutedForeground}
      className={cn(
        "min-h-12 rounded-full border border-input bg-card px-4 py-2.5 text-body-lg text-foreground",
        className
      )}
      {...props}
    />
  );
});
