import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

export type TextareaProps = TextInputProps & { className?: string };

export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <TextInput
      ref={ref}
      multiline
      textAlignVertical="top"
      placeholderTextColor="#6c7278"
      className={cn(
        "min-h-[96px] rounded-2xl border border-input bg-card px-4 py-3 text-[15px] text-foreground",
        className
      )}
      {...props}
    />
  );
});
