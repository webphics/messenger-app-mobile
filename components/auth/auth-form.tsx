import { router } from "expo-router";
import { AlertCircle, Eye, EyeOff, Sparkles } from "@/components/icons";
import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { hapticSelection, hapticSuccess, hapticWarning } from "@/lib/haptics";
import { ROLE_HREF } from "@/lib/hub-routes";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { settleDownEnter, settleEnter } from "@/lib/motion-enter";
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
  const reduceMotion = useReducedMotion();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const register = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
    hapticSelection();
  }

  const scoreLevel = score === "strong" ? 3 : score === "fair" ? 2 : score === "weak" ? 1 : 0;

  return (
    // Shrinking the scroll viewport is what keeps a focused field above the
    // Android IME; iOS does the same natively via automaticallyAdjustKeyboardInsets.
    // `contentRef` must sit on this node: `keyboardInset` is padding *inside* its
    // frame, so measuring it stays stable across repeat keyboardDidShow events
    // and reports a bottom the host has already resized when the host resizes.
    <View
      ref={contentRef}
      collapsable={false}
      className="flex-1 bg-bg"
      style={{ paddingBottom: keyboardInset }}
    >
      <ScrollView
        {...scrollProps}
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: Math.max(screenTopPad(insets.top), 24),
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Animated.View
          entering={settleDownEnter(!!reduceMotion)}
          className="items-center"
        >
          <Image
            source={require("../../assets/images/logo.png")}
            accessibilityLabel="Enki"
            className="mb-3 h-20 w-28"
            resizeMode="contain"
          />
          <Text variant="display" className="text-center text-ink">
            Enki
          </Text>
          <Text variant="meta" className="mt-1 text-center text-muted">
            Internal Support & Team Collaboration
          </Text>
        </Animated.View>

        <Animated.View
          entering={settleEnter(!!reduceMotion, 60)}
          className="mt-6 rounded-3xl border border-line/70 bg-surface p-5 shadow-md shadow-black/8"
        >
          <Text variant="headline" className="text-ink">
            {register ? "Create an account" : "Welcome back"}
          </Text>
          <Text variant="label" className="mt-0.5 font-normal text-muted">
            {register
              ? "Sign up with your organization email"
              : "Sign in to access your queue and chats"}
          </Text>

          <View className="mt-5">
            <Text variant="label" className="mb-1.5 text-ink">
              Work Email
            </Text>
            <Input
              className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
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
                <Text variant="label" className="font-medium text-danger">
                  {emailError}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="mt-4">
            <Text variant="label" className="mb-1.5 text-ink">
              Password
            </Text>
            <View className="relative justify-center">
              <Input
                className="h-12 rounded-2xl border-line/80 bg-line/35 pr-11 font-sans text-base text-ink"
                placeholder="••••••••"
                accessibilityLabel="Password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setPasswordError(null);
                }}
              />
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 size-8 items-center justify-center rounded-full"
              >
                {showPassword ? (
                  <EyeOff color={colors.inkSoft} size={18} />
                ) : (
                  <Eye color={colors.muted} size={18} />
                )}
              </TactilePressable>
            </View>
            {passwordError ? (
              <View className="mt-1.5 flex-row items-center gap-1.5">
                <AlertCircle color={colors.danger} size={14} />
                <Text variant="label" className="font-medium text-danger">
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
                  <Text variant="label" className="text-muted">
                    Password strength
                  </Text>
                  <Text
                    variant="label"
                    className={`font-bold ${
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
                <Text variant="label" className="mb-1.5 text-ink">
                  Confirm Password
                </Text>
                <View className="relative justify-center">
                  <Input
                    className="h-12 rounded-2xl border-line/80 bg-line/35 pr-11 font-sans text-base text-ink"
                    placeholder="••••••••"
                    accessibilityLabel="Confirm password"
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={confirm}
                    onChangeText={(v) => {
                      setConfirm(v);
                      setConfirmError(null);
                    }}
                  />
                  <TactilePressable
                    accessibilityRole="button"
                    accessibilityLabel={showConfirm ? "Hide confirm password" : "Show confirm password"}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => setShowConfirm((prev) => !prev)}
                    className="absolute right-3 size-8 items-center justify-center rounded-full"
                  >
                    {showConfirm ? (
                      <EyeOff color={colors.inkSoft} size={18} />
                    ) : (
                      <Eye color={colors.muted} size={18} />
                    )}
                  </TactilePressable>
                </View>
                {confirmError ? (
                  <View className="mt-1.5 flex-row items-center gap-1.5">
                    <AlertCircle color={colors.danger} size={14} />
                    <Text variant="label" className="font-medium text-danger">
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
                <Text variant="label" className="font-bold text-primary">
                  Suggest strong password
                </Text>
              </TactilePressable>
            </>
          ) : null}

          <Button className="mt-6 min-h-12 w-full" onPress={() => void onSubmit()}>
            <Text>{register ? "Create Account" : "Sign In"}</Text>
          </Button>
        </Animated.View>

        <Animated.View entering={settleEnter(!!reduceMotion, 120)}>
          <TactilePressable
            accessibilityRole="link"
            onPress={() =>
              router.replace(register ? "/(auth)/sign-in" : "/(auth)/register")
            }
            className="mt-6 min-h-11 items-center justify-center"
          >
            <Text variant="meta" className="font-semibold text-primary">
              {register
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </Text>
          </TactilePressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
