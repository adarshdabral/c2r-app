import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Link } from "expo-router";
import { ArrowLeft, Recycle } from "lucide-react-native";
import {
  Screen,
  Text,
  Button,
  Input,
  Field,
  Surface,
  Select,
  OtpInput,
  type SelectOption,
} from "@/components/ui";
import { api, getApiErrorMessage, type LoginResponse } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  USER_TYPES,
  DEFAULT_USER_TYPE,
  USER_TYPE_LABELS,
  type UserType,
} from "@/lib/userTypes";

type Stage = "form" | "otp";

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "recycler", label: "Recycler" },
];

const USER_TYPE_OPTIONS: SelectOption<UserType>[] = USER_TYPES.map((t) => ({
  value: t,
  label: USER_TYPE_LABELS[t],
}));

export default function RegisterScreen() {
  const { signIn } = useAuth();
  const [stage, setStage] = useState<Stage>("form");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [userType, setUserType] = useState<UserType>(DEFAULT_USER_TYPE);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [otp, setOtp] = useState("");
  const [isResending, setIsResending] = useState(false);

  const handleRegister = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    setInfo("");
    try {
      // Recyclers add store location(s) after verifying, not at sign-up.
      await api.post("/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        ...(role === "user" ? { user_type: userType } : {}),
      });
      setStage("otp");
      setInfo("We've emailed you a 6-digit code. It expires in 10 minutes.");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Registration failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    setInfo("");
    try {
      const { data } = await api.post<LoginResponse>("/auth/verify-otp", {
        email: email.trim(),
        otp,
      });
      await signIn({
        token: data.token,
        role: data.role,
        user_type: data.user_type,
      });
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Verification failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError("");
    setInfo("");
    try {
      await api.post("/auth/resend-otp", { email: email.trim() });
      setInfo("A new code has been sent to your email.");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to resend OTP"));
    } finally {
      setIsResending(false);
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
          <View className="mb-7">
            <Text className="text-[26px] font-extrabold tracking-tight">
              {stage === "form" ? "Create account" : "Verify your email"}
            </Text>
            {stage === "form" ? (
              <Text className="mt-1.5 text-[14px] text-muted-foreground">
                Join Connect2Recycle in a few seconds.
              </Text>
            ) : (
              <Text className="mt-1.5 text-[14px] text-muted-foreground">
                Enter the 6-digit code sent to{" "}
                <Text className="font-semibold text-foreground">{email}</Text>
              </Text>
            )}
          </View>

          {stage === "form" ? (
            <View className="gap-5">
              <Field label="Name">
                <Input value={name} onChangeText={setName} autoCapitalize="words" />
              </Field>

              <Field label="Email">
                <Input
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
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
              </Field>

              <Field label="Role">
                <View className="flex-row gap-1 rounded-full bg-muted p-1">
                  {ROLE_OPTIONS.map((opt) => {
                    const active = role === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setRole(opt.value)}
                        className={
                          "flex-1 items-center rounded-full px-4 py-2.5 " +
                          (active ? "bg-primary" : "")
                        }
                      >
                        <Text
                          className={
                            "text-[14px] font-semibold " +
                            (active
                              ? "text-primary-foreground"
                              : "text-muted-foreground")
                          }
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              {role === "user" ? (
                <Field label="Account type">
                  <Select<UserType>
                    value={userType}
                    onValueChange={setUserType}
                    options={USER_TYPE_OPTIONS}
                  />
                </Field>
              ) : (
                <View className="rounded-xl bg-muted px-4 py-3">
                  <Text className="text-[12.5px] text-muted-foreground">
                    You'll add your store location(s) after verifying your email.
                  </Text>
                </View>
              )}

              {error ? (
                <View className="rounded-xl bg-destructive/10 px-4 py-3">
                  <Text className="text-[13px] font-medium text-destructive">
                    {error}
                  </Text>
                </View>
              ) : null}
              {info ? (
                <View className="rounded-xl bg-primary/10 px-4 py-3">
                  <Text className="text-[13px] font-medium text-primary">
                    {info}
                  </Text>
                </View>
              ) : null}

              <Button onPress={handleRegister} loading={isLoading}>
                Sign Up
              </Button>
            </View>
          ) : (
            <View className="gap-5">
              <Field label="Verification code">
                <OtpInput value={otp} onChange={setOtp} />
              </Field>

              <Button
                onPress={handleVerify}
                loading={isLoading}
                disabled={otp.length !== 6}
              >
                Verify & Continue
              </Button>

              <View className="flex-row items-center justify-between">
                <Pressable onPress={handleResend} disabled={isResending} hitSlop={8}>
                  <Text className="text-[13px] font-medium text-primary">
                    {isResending ? "Sending..." : "Resend code"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStage("form");
                    setOtp("");
                    setError("");
                    setInfo("");
                  }}
                  hitSlop={8}
                >
                  <Text className="text-[13px] font-medium text-muted-foreground">
                    Use a different email
                  </Text>
                </Pressable>
              </View>

              {error ? (
                <View className="rounded-xl bg-destructive/10 px-4 py-3">
                  <Text className="text-[13px] font-medium text-destructive">
                    {error}
                  </Text>
                </View>
              ) : null}
              {info ? (
                <View className="rounded-xl bg-primary/10 px-4 py-3">
                  <Text className="text-[13px] font-medium text-primary">
                    {info}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </Surface>
      </KeyboardAvoidingView>
    </Screen>
  );
}
