import { router } from "expo-router";
import { AlertCircle, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { ROLE_HREF } from "@/lib/hub-routes";
import {
  emailLooksValid,
  passwordIsValid,
  passwordScore,
  suggestPassword,
} from "@/lib/password";
import { loginSession } from "@/lib/session";
import { colors, screenTopPad } from "@/lib/tokens";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const insets = useSafeAreaInsets();
  const register = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const score = passwordScore(password);

  async function onSubmit() {
    const nextEmail = emailLooksValid(email.trim()) ? null : "Enter a valid email address";
    const nextPassword = passwordIsValid(password)
      ? null
      : "8+ characters, with uppercase, lowercase, number & symbol";
    const nextConfirm = register && confirm !== password ? "Passwords do not match" : null;
    setEmailError(nextEmail);
    setPasswordError(nextPassword);
    setConfirmError(nextConfirm);
    if (nextEmail || nextPassword || nextConfirm) {
      hapticWarning();
      return;
    }
    hapticSuccess();
    const blob = await loginSession(email.trim());
    router.replace(ROLE_HREF[blob.role]);
  }

  function onSuggest() {
    const next = suggestPassword();
    setPassword(next);
    setConfirm(next);
    setPasswordError(null);
    setConfirmError(null);
    hapticSuccess();
  }

  const scoreLevel = score === "strong" ? 3 : score === "fair" ? 2 : score === "weak" ? 1 : 0;

  return (
    <ScrollView
      className="flex-1 bg-bg px-4"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingTop: Math.max(screenTopPad(insets.top), 24),
        paddingBottom: insets.bottom + 24,
      }}
    >
      <View className="items-center">
        <Image
          source={require("../../assets/images/splash-icon.png")}
          accessibilityLabel="Messenger Chat"
          className="mb-3 h-20 w-20 rounded-3xl shadow-md shadow-black/10"
          resizeMode="cover"
        />
        <Text className="text-center font-sans text-2xl font-extrabold text-ink">
          Messenger Chat
        </Text>
        <Text className="mt-1 text-center font-sans text-sm font-normal text-muted">
          Internal Support & Team Collaboration
        </Text>
      </View>

      <View className="mt-6 rounded-3xl border border-line bg-surface p-5 shadow-lg shadow-black/5">
        <Text className="font-sans text-xl font-extrabold text-ink">
          {register ? "Create an account" : "Welcome back"}
        </Text>
        <Text className="mt-0.5 font-sans text-xs font-normal text-muted">
          {register
            ? "Sign up with your organization email"
            : "Sign in to access your queue and chats"}
        </Text>

        <View className="mt-5">
          <Text className="mb-1.5 font-sans text-xs font-semibold text-ink">
            Work Email
          </Text>
          <Input
            className="h-12 rounded-2xl border-line bg-bg font-sans text-sm"
            placeholder="name@company.com"
            accessibilityLabel="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setEmailError(null);
            }}
          />
          {emailError ? (
            <View className="mt-1.5 flex-row items-center gap-1.5">
              <AlertCircle color={colors.danger} size={14} />
              <Text className="font-sans text-xs font-medium text-danger">
                {emailError}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-4">
          <Text className="mb-1.5 font-sans text-xs font-semibold text-ink">
            Password
          </Text>
          <Input
            className="h-12 rounded-2xl border-line bg-bg font-sans text-sm"
            placeholder="••••••••"
            accessibilityLabel="Password"
            secureTextEntry
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setPasswordError(null);
            }}
          />
          {passwordError ? (
            <View className="mt-1.5 flex-row items-center gap-1.5">
              <AlertCircle color={colors.danger} size={14} />
              <Text className="font-sans text-xs font-medium text-danger">
                {passwordError}
              </Text>
            </View>
          ) : null}
        </View>

        {register ? (
          <>
            {/* Visual Password Strength Indicator */}
            <View className="mt-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-sans text-[11px] font-semibold text-muted">
                  Password strength
                </Text>
                <Text
                  className={`font-sans text-[11px] font-bold ${
                    score === "strong"
                      ? "text-success"
                      : score === "fair"
                        ? "text-amber"
                        : score === "weak"
                          ? "text-danger"
                          : "text-muted"
                  }`}
                >
                  {score === "empty" ? "Required" : score.toUpperCase()}
                </Text>
              </View>
              <View className="mt-1.5 flex-row gap-1.5">
                <View
                  className={`h-1.5 flex-1 rounded-full ${
                    scoreLevel >= 1
                      ? scoreLevel === 1
                        ? "bg-danger"
                        : scoreLevel === 2
                          ? "bg-amber"
                          : "bg-success"
                      : "bg-line"
                  }`}
                />
                <View
                  className={`h-1.5 flex-1 rounded-full ${
                    scoreLevel >= 2
                      ? scoreLevel === 2
                        ? "bg-amber"
                        : "bg-success"
                      : "bg-line"
                  }`}
                />
                <View
                  className={`h-1.5 flex-1 rounded-full ${
                    scoreLevel >= 3 ? "bg-success" : "bg-line"
                  }`}
                />
              </View>
            </View>

            <View className="mt-4">
              <Text className="mb-1.5 font-sans text-xs font-semibold text-ink">
                Confirm Password
              </Text>
              <Input
                className="h-12 rounded-2xl border-line bg-bg font-sans text-sm"
                placeholder="••••••••"
                accessibilityLabel="Confirm password"
                secureTextEntry
                value={confirm}
                onChangeText={(v) => {
                  setConfirm(v);
                  setConfirmError(null);
                }}
              />
              {confirmError ? (
                <View className="mt-1.5 flex-row items-center gap-1.5">
                  <AlertCircle color={colors.danger} size={14} />
                  <Text className="font-sans text-xs font-medium text-danger">
                    {confirmError}
                  </Text>
                </View>
              ) : null}
            </View>

            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Suggest secure password"
              onPress={onSuggest}
              className="mt-3.5 flex-row items-center gap-1.5 self-start rounded-xl bg-primary-soft/70 px-3 py-1.5"
            >
              <Sparkles color={colors.primary} size={14} />
              <Text className="font-sans text-xs font-bold text-primary">
                Suggest strong password
              </Text>
            </TactilePressable>
          </>
        ) : null}

        <Button className="mt-6 min-h-12 w-full" onPress={() => void onSubmit()}>
          <Text>{register ? "Create Account" : "Sign In"}</Text>
        </Button>
      </View>

      <TactilePressable
        accessibilityRole="link"
        onPress={() =>
          router.replace(register ? "/(auth)/sign-in" : "/(auth)/register")
        }
        className="mt-6 min-h-11 items-center justify-center"
      >
        <Text className="font-sans text-sm font-semibold text-primary">
          {register
            ? "Already have an account? Sign in"
            : "Don't have an account? Create one"}
        </Text>
      </TactilePressable>
    </ScrollView>
  );
}
