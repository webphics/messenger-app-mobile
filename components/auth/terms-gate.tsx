import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertCircle, ExternalLink } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { refusalSentence } from "@/lib/api-result";
import { useAuth } from "@/lib/auth-context";
import { confirmSignOut } from "@/lib/confirm-sign-out";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { LEGAL_LINKS } from "@/lib/legal-links";
import { settleDownEnter, settleEnter } from "@/lib/motion-enter";
import { signedInDestination } from "@/lib/onboarding-gate";
import { acceptTerms } from "@/lib/terms-api";
import { colors, screenTopPad } from "@/lib/tokens";

/**
 * The terms gate (App Store guideline 1.2): a signed-in person who has never
 * agreed to the Terms of Use agrees here before anything else.
 *
 * Reached through `signedInDestination`, the way onboarding is, because the
 * sign-up form's checkbox is only one of the ways an account comes to exist —
 * a first Google sign-in and a sign-up link opened from an unknown address
 * create one without it, and accounts from before this step existed have none.
 *
 * Two ways off it and no third: agree, which the API records with the date, or
 * sign out. There is no back, because the screen behind it is whatever the
 * person was not yet allowed to see.
 */

const POINTS = [
  "There is no tolerance for objectionable content or abusive users. Content that breaks the terms is removed, and the accounts that post it are suspended or removed.",
  "Never share intimate images of anyone without their consent — including images that are AI-generated or faked to look like a real person.",
  "No harassment, threats, hate, sexual content, spam or anything unlawful, in messages, Wall posts or groups.",
  "You can report any post, message or group, and block anyone. We review reports within 24 hours.",
];

export function TermsGate() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { state, accountUpdated, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const signedIn = state.status === "signed-in";

  async function agree() {
    if (saving || !signedIn) return;
    setSaving(true);
    setNotice(null);
    const result = await acceptTerms();
    setSaving(false);
    if (!result.ok) {
      hapticWarning();
      setNotice(refusalSentence(result.failure, "The server sent something this app could not read."));
      return;
    }
    hapticSuccess();
    accountUpdated(result.value);
    router.replace(signedInDestination(result.value));
  }

  async function leave() {
    if (await confirmSignOut()) await signOut();
  }

  return (
    <ScrollView
      className="flex-1 bg-bg px-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingTop: Math.max(screenTopPad(insets.top), 24),
        paddingBottom: insets.bottom + 24,
      }}
    >
      <Animated.View entering={settleDownEnter(!!reduceMotion)} className="items-center">
        <Text variant="display" className="text-center text-ink">
          Before you start
        </Text>
        <Text variant="meta" className="mt-1 text-center text-muted">
          Agree to the Terms of Use to use ChatRoute
        </Text>
      </Animated.View>

      <Animated.View
        entering={settleEnter(!!reduceMotion, 60)}
        className="mt-6 gap-4 rounded-3xl border border-line/70 bg-surface p-5 shadow-md shadow-black/8"
      >
        <View className="gap-3">
          {POINTS.map((point) => (
            <View key={point} className="flex-row gap-2.5">
              <View aria-hidden className="mt-2 size-1.5 rounded-full bg-primary" />
              <Text variant="body" className="min-w-0 flex-1 text-ink">
                {point}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-1">
          <LegalLink label="Read the Terms of Use" url={LEGAL_LINKS.terms} />
          <LegalLink label="Read the Privacy Policy" url={LEGAL_LINKS.privacy} />
        </View>

        {notice ? (
          <View className="flex-row items-start gap-1.5" accessibilityLiveRegion="polite">
            <View className="mt-0.5">
              <AlertCircle color={colors.danger} size={14} />
            </View>
            <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
              {notice}
            </Text>
          </View>
        ) : null}

        <Button
          className="min-h-12 w-full"
          onPress={() => void agree()}
          disabled={saving || !signedIn}
          accessibilityState={{ disabled: saving || !signedIn, busy: saving }}
        >
          {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
          <Text>I agree to the Terms of Use</Text>
        </Button>

        <Button
          variant="ghost"
          className="min-h-12 w-full"
          disabled={saving}
          onPress={() => void leave()}
        >
          <Text className="text-danger">Sign out</Text>
        </Button>
      </Animated.View>
    </ScrollView>
  );
}

function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <TactilePressable
      accessibilityRole="link"
      accessibilityLabel={`${label}, opens in your browser`}
      onPress={() => void Linking.openURL(url)}
      className="min-h-11 flex-row items-center gap-2"
    >
      <Text variant="title" className="text-primary">
        {label}
      </Text>
      <ExternalLink color={colors.primary} size={16} />
    </TactilePressable>
  );
}
