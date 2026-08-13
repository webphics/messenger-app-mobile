import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { ROLE_HREF } from "@/lib/hub-routes";
import {
  emailLooksValid,
  passwordIsValid,
  passwordScore,
  suggestPassword,
} from "@/lib/password";
import { loginSession } from "@/lib/session";
import { screenTopPad } from "@/lib/tokens";

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
    const nextEmail = emailLooksValid(email.trim()) ? null : "Enter a valid email";
    const nextPassword = passwordIsValid(password)
      ? null
      : "8+ chars, upper, lower, number, symbol";
    const nextConfirm = register && confirm !== password ? "Passwords must match" : null;
    setEmailError(nextEmail);
    setPasswordError(nextPassword);
    setConfirmError(nextConfirm);
    if (nextEmail || nextPassword || nextConfirm) return;
    const blob = await loginSession(email.trim());
    router.replace(ROLE_HREF[blob.role]);
  }

  function onSuggest() {
    const next = suggestPassword();
    setPassword(next);
    setConfirm(next);
    setPasswordError(null);
    setConfirmError(null);
  }

  return (
    <View
      className="flex-1 bg-bg px-4"
      style={{ paddingTop: screenTopPad(insets.top) }}
    >
      <Image
        source={require("../../assets/images/splash-icon.png")}
        accessibilityLabel="Messenger Chat"
        className="mb-3 h-24 w-24 self-center"
        resizeMode="contain"
      />
      <Text className="mb-8 text-center font-sans text-2xl font-bold text-ink">
        Messenger Chat
      </Text>
      <View className="rounded-2xl border border-line bg-surface p-4">
        <Text className="font-sans text-xl font-bold text-ink">
          {register ? "Create account" : "Sign in"}
        </Text>
        <Input
          className="mt-6 h-11 rounded-xl border-line bg-bg"
          placeholder="Email"
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
          <Text className="mt-1 font-sans text-sm font-normal text-danger">
            {emailError}
          </Text>
        ) : null}
        <Input
          className="mt-3 h-11 rounded-xl border-line bg-bg"
          placeholder="Password"
          accessibilityLabel="Password"
          secureTextEntry
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setPasswordError(null);
          }}
        />
        {passwordError ? (
          <Text className="mt-1 font-sans text-sm font-normal text-danger">
            {passwordError}
          </Text>
        ) : null}
        {register ? (
          <>
            <Text className="mt-2 font-sans text-xs font-medium text-muted">
              Strength: {score === "empty" ? "—" : score}
            </Text>
            <Input
              className="mt-3 h-11 rounded-xl border-line bg-bg"
              placeholder="Confirm password"
              accessibilityLabel="Confirm password"
              secureTextEntry
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v);
                setConfirmError(null);
              }}
            />
            {confirmError ? (
              <Text className="mt-1 font-sans text-sm font-normal text-danger">
                {confirmError}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Suggest password"
              onPress={onSuggest}
              className="mt-3 min-h-11 justify-center"
            >
              <Text className="font-sans text-sm font-medium text-primary">
                Suggest password
              </Text>
            </Pressable>
          </>
        ) : null}
        <Button className="mt-4" onPress={() => void onSubmit()}>
          <Text>{register ? "Register" : "Sign in"}</Text>
        </Button>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          router.replace(register ? "/(auth)/sign-in" : "/(auth)/register")
        }
        className="mt-6 min-h-11 items-center justify-center"
      >
        <Text className="font-sans text-sm font-medium text-primary">
          {register ? "Already have an account? Sign in" : "Need an account? Register"}
        </Text>
      </Pressable>
    </View>
  );
}
