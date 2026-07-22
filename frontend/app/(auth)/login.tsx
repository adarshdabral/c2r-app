import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Link } from "expo-router";
import { ArrowLeft, Recycle } from "lucide-react-native";
import { Screen, Text, Button, Input, Field, Surface } from "@/components/ui";
import { api, getApiErrorMessage, type LoginResponse } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        email: email.trim(),
        password,
      });
      // signIn persists token/role/user_type and routes to the role home.
      await signIn({
        token: data.token,
        role: data.role,
        user_type: data.user_type,
      });
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Login failed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen contentClassName="py-6">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Link href="/" asChild>
          <Pressable className="mb-7 flex-row items-center gap-1.5">
            <ArrowLeft size={16} color="#6c7278" />
            <Text className="text-[14px] font-medium text-muted-foreground">
              Back
            </Text>
          </Pressable>
        </Link>

        {/* Brand */}
        <View className="mb-7 flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Recycle size={24} color="#fff" strokeWidth={2.2} />
          </View>
          <Text className="text-[19px] font-extrabold tracking-tight">
            Connect2Recycle
          </Text>
        </View>

        <Surface className="p-6">
          <View className="mb-7">
            <Text className="text-[26px] font-extrabold tracking-tight">
              Welcome back
            </Text>
            <Text className="mt-1.5 text-[14px] text-muted-foreground">
              Sign in to continue to your account.
            </Text>
          </View>

          <View className="gap-5">
            <Field label="Email">
              <Input
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
            </Field>

            <Field label="Password">
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
              <View className="mt-1 items-end">
                <Link href="/forgot-password" asChild>
                  <Pressable hitSlop={8}>
                    <Text className="text-[13px] font-semibold text-primary">
                      Forgot password?
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </Field>

            {error ? (
              <View className="rounded-xl bg-destructive/10 px-4 py-3">
                <Text className="text-[13px] font-medium text-destructive">
                  {error}
                </Text>
              </View>
            ) : null}

            <Button onPress={handleSubmit} loading={isLoading}>
              Sign In
            </Button>
          </View>

          <View className="mt-6 flex-row justify-center">
            <Text className="text-[14px] text-muted-foreground">No account? </Text>
            <Link href="/register" asChild>
              <Pressable hitSlop={6}>
                <Text className="text-[14px] font-semibold text-primary">
                  Sign up
                </Text>
              </Pressable>
            </Link>
          </View>
        </Surface>
      </KeyboardAvoidingView>
    </Screen>
  );
}
