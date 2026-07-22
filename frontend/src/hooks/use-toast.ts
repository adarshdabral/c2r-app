import Toast from "react-native-toast-message";

type ToastVariant = "default" | "destructive" | "success";

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
};

const typeFor = (variant?: ToastVariant) => {
  if (variant === "destructive") return "error";
  if (variant === "success") return "success";
  return "info";
};

/**
 * Toast helper that mirrors the web shadcn `useToast()` API
 * (`toast({ title, description, variant })`) so call sites port unchanged.
 * Backed by react-native-toast-message; render <Toast/> once at the app root.
 */
export function toast({ title, description, variant }: ToastOptions) {
  Toast.show({
    type: typeFor(variant),
    text1: title,
    text2: description,
    position: "top",
    visibilityTime: 3500,
  });
}

export function useToast() {
  return { toast };
}
