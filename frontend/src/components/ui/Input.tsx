import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

export type InputProps = TextInputProps & { className?: string };

/**
 * Text input styled to match the web app's rounded clay inputs. Uses the
 * muted-foreground color for the placeholder to match the design.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#6c7278"
      className={cn(
        "h-12 rounded-full border border-input bg-card px-4 text-[15px] text-foreground",
        className
      )}
      {...props}
    />
  );
});
