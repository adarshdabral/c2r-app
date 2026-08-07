import { Text as RNText, type TextProps } from "react-native";
import { cn } from "@/lib/utils";

/**
 * Semantic type-scale variants — the tokenized replacement for ad-hoc
 * `text-[Npx]` sizes. Titles all use the Fraunces display face so a "title"
 * looks the same in every role. Pass `className` to override anything.
 */
export type TextVariant =
  | "hero"
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "body-lg"
  | "body"
  | "label"
  | "caption"
  | "micro";

const variantClass: Record<TextVariant, string> = {
  hero: "text-hero font-display tracking-tight text-foreground",
  display: "text-display font-display tracking-tight text-foreground",
  h1: "text-h1 font-display text-foreground",
  h2: "text-h2 font-display text-foreground",
  h3: "text-h3 font-semibold text-foreground",
  "body-lg": "text-body-lg text-foreground",
  body: "text-body text-foreground",
  label: "text-label font-medium text-foreground",
  caption: "text-caption text-muted-foreground",
  micro: "text-micro text-muted-foreground",
};

/**
 * Themed Text — defaults to the foreground color so screens don't have to
 * repeat it. Use `variant` for the type scale; `className` still overrides.
 */
export function Text({
  className,
  variant,
  ...props
}: TextProps & { className?: string; variant?: TextVariant }) {
  return (
    <RNText
      className={cn(variant ? variantClass[variant] : "text-foreground", className)}
      {...props}
    />
  );
}
