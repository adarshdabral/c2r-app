import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Link, router } from "expo-router";
import { ArrowLeft, MailCheck, Recycle } from "lucide-react-native";
import { Screen, Text, Button, Input, Field, Surface } from "@/components/ui";
import { api } from "@/lib/api";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Something went wrong. Try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen contentClassName="py-6">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Link href="/login" asChild>
          <Pressable className="mb-7 flex-row items-center gap-1.5">
            <ArrowLeft size={16} color="#6c7278" />
            <Text className="text-[14px] font-medium text-muted-foreground">
              Back to login
            </Text>
          </Pressable>
        </Link>

        <View className="mb-7 flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Recycle size={24} color="#fff" strokeWidth={2.2} />
          </View>
          <Text className="text-[19px] font-extrabold tracking-tight">
            Connect2Recycle
          </Text>
        </View>

        <Surface className="p-6">
          {sent ? (
            <View className="items-center gap-4 py-4">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/15">
                <MailCheck size={32} color="#34c759" strokeWidth={2.2} />
              </View>
              <View>
                <Text className="text-center text-[22px] font-extrabold tracking-tight">
                  Check your email
                </Text>
                <Text className="mt-1.5 text-center text-[14px] text-muted-foreground">
                  If an account exists for{" "}
                  <Text className="font-semibold text-foreground">{email}</Text>,
                  we've sent a link to reset your password. The link expires in 1
                  hour.
                </Text>
              </View>
              <Button className="mt-2 w-full" onPress={() => router.replace("/login")}>
                Back to login
              </Button>
            </View>
          ) : (
            <>
              <View className="mb-7">
                <Text className="text-[26px] font-extrabold tracking-tight">
                  Reset your password
                </Text>
                <Text className="mt-1.5 text-[14px] text-muted-foreground">
                  Enter your email and we'll send you a reset link.
                </Text>
              </View>

              <View className="gap-5">
                <Field label="Email">
                  <Input
                    placeholder="you@example.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </Field>

                {error ? (
                  <View className="rounded-xl bg-destructive/10 px-4 py-3">
                    <Text className="text-[13px] font-medium text-destructive">
                      {error}
                    </Text>
                  </View>
                ) : null}

                <Button onPress={handleSubmit} loading={isLoading}>
                  Send reset link
                </Button>
              </View>

              <View className="mt-6 flex-row justify-center">
                <Text className="text-[14px] text-muted-foreground">
                  Remembered it?{" "}
                </Text>
                <Link href="/login" asChild>
                  <Pressable hitSlop={6}>
                    <Text className="text-[14px] font-semibold text-primary">
                      Sign in
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </>
          )}
        </Surface>
      </KeyboardAvoidingView>
    </Screen>
  );
}
