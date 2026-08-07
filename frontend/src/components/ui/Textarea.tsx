import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";
import { useColors } from "@/lib/theme";

export type TextareaProps = TextInputProps & { className?: string };

export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  { className, ...props },
  ref
) {
  const c = useColors();
  return (
    <TextInput
      ref={ref}
      multiline
      textAlignVertical="top"
      placeholderTextColor={c.mutedForeground}
      className={cn(
        "min-h-[96px] rounded-2xl border border-input bg-card px-4 py-3 text-body-lg text-foreground",
        className
      )}
      {...props}
    />
  );
});
