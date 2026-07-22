import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, CheckCircle2, Recycle } from "lucide-react-native";
import { Screen, Text, Button, Input, Field, Surface } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * The reset link is emailed as a deep link (connect2recycle://reset-password?token=…)
 * / the web URL; the token arrives as a route param. A user can also paste a
 * token manually if they only received the web link. See VERIFY.md.
 */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? "");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (isLoading) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not reset password.");
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
          {done ? (
            <View className="items-center gap-4 py-4">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/15">
                <CheckCircle2 size={32} color="#34c759" strokeWidth={2.2} />
              </View>
              <View>
                <Text className="text-center text-[22px] font-extrabold tracking-tight">
                  Password updated
                </Text>
                <Text className="mt-1.5 text-center text-[14px] text-muted-foreground">
                  Redirecting you to sign in…
                </Text>
              </View>
            </View>
          ) : !token ? (
            <View className="items-center py-4">
              <Text className="text-center text-[22px] font-extrabold tracking-tight">
                Enter your reset token
              </Text>
              <Text className="mt-1.5 text-center text-[14px] text-muted-foreground">
                Paste the token from your reset email, or request a new link.
              </Text>
              <View className="mt-5 w-full gap-3">
                <Input
                  placeholder="Reset token"
                  value={token}
                  onChangeText={setToken}
                  autoCapitalize="none"
                />
                <Link href="/forgot-password" asChild>
                  <Button variant="outline">Request new link</Button>
                </Link>
              </View>
            </View>
          ) : (
            <>
              <View className="mb-7">
                <Text className="text-[26px] font-extrabold tracking-tight">
                  Set a new password
                </Text>
                <Text className="mt-1.5 text-[14px] text-muted-foreground">
                  Choose a password you don't use anywhere else.
                </Text>
              </View>

              <View className="gap-5">
                <Field label="New password">
                  <View className="relative justify-center">
                    <Input
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      className="pr-16"
                      autoCapitalize="none"
                    />
                    <Pressable
                      onPress={() => setShowPassword((s) => !s)}
                      className="absolute right-3"
                      hitSlop={8}
                    >
                      <Text className="text-[13px] font-semibold text-primary">
                        {showPassword ? "Hide" : "Show"}
                      </Text>
                    </Pressable>
                  </View>
                </Field>

                <Field label="Confirm password">
                  <Input
                    secureTextEntry={!showPassword}
                    value={confirm}
                    onChangeText={setConfirm}
                    autoCapitalize="none"
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
                  Update password
                </Button>
              </View>
            </>
          )}
        </Surface>
      </KeyboardAvoidingView>
    </Screen>
  );
}
