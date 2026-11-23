import { router, usePreventRemove } from "expo-router";
import Constants from "expo-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Switch,
  useWindowDimensions,
  View,
  type TextInputInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertCircle, CheckCircle, FileText, Image as ImageIcon, Star, X } from "@/components/icons";
import { InScreenHeader } from "@/components/in-screen-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { refusalSentence } from "@/lib/api-result";
import { APP_USER_AGENT } from "@/lib/app-user-agent";
import { pickDocument, pickFromLibrary, type PickedAttachment } from "@/lib/attachments";
import { cn } from "@/lib/cn";
import { createFeedback } from "@/lib/feedback-api";
import { FEEDBACK_KINDS, FEEDBACK_SEVERITIES, type FeedbackKind } from "@/lib/feedback-parse";
import {
  checkFeedbackDraft,
  emptyFeedbackDraft,
  feedbackAttachmentType,
  feedbackCategories,
  feedbackFields,
  feedbackSentSentence,
  withFeedbackKind,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_DESCRIPTION_MAX,
  FEEDBACK_DETAIL_MAX,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_SEVERITY_HINTS,
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_TITLE_MAX,
  type FeedbackDraft,
  type FeedbackField,
} from "@/lib/feedback-rules";
import { hapticSelection, hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { colors, screenBottomPad } from "@/lib/tokens";

/**
 * Reporting a bug or sending feedback about the app, from Settings, for every
 * role: the API's `POST /feedback` takes one from anybody signed in.
 *
 * The web form's fields, in its order, with one difference: a single
 * attachment rather than four (`MAX_FEEDBACK_ATTACHMENTS_ON_MOBILE` says why).
 * The app version, the platform, the device's user agent, its language and its
 * window size go with it unasked, which is what makes a report from a phone
 * something a developer can act on.
 *
 * Filing is all a reporter does. Nothing is read back to them: the reference
 * the API answers with is shown once, to quote in a conversation.
 */

const KIND_TITLES: Record<FeedbackKind, string> = {
  bug_report: "Report a bug",
  feedback: "Send feedback",
};

const KIND_INTROS: Record<FeedbackKind, string> = {
  bug_report: "Tell us what went wrong. The more detail you give, the faster it gets fixed.",
  feedback: "Tell us what you think of the app, or what would make it better.",
};

function environmentLocale(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <View className="mt-1.5 flex-row items-center gap-1.5" accessibilityLiveRegion="polite">
      <AlertCircle color={colors.danger} size={14} />
      <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
        {message}
      </Text>
    </View>
  );
}

function SectionLabel({ children, optional }: { children: string; optional?: boolean }) {
  return (
    <Text variant="label" className="mb-1.5 mt-5 text-ink">
      {children}
      {optional ? <Text variant="label" className="font-normal text-muted"> (optional)</Text> : null}
    </Text>
  );
}

function Chip({
  label,
  selected,
  onPress,
  role = "radio",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: "radio" | "tab";
}) {
  return (
    <TactilePressable
      accessibilityRole={role}
      accessibilityState={{ selected, checked: role === "radio" ? selected : undefined }}
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(
        "min-h-11 items-center justify-center rounded-full border px-4",
        selected ? "border-primary bg-primary" : "border-line/80 bg-surface",
      )}
    >
      <Text variant="label" className={selected ? "text-primary-foreground" : "text-ink"}>
        {label}
      </Text>
    </TactilePressable>
  );
}

const MULTILINE_CLASS =
  "rounded-2xl border-line/80 bg-line/35 px-3.5 py-3 font-sans text-base text-ink";

export function FeedbackFormScreen({ initialKind }: { initialKind: FeedbackKind }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();

  const [draft, setDraft] = useState<FeedbackDraft>(() => emptyFeedbackDraft(initialKind));
  const [attachment, setAttachment] = useState<(PickedAttachment & { type: string }) | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FeedbackField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const titleRef = useRef<TextInputInstance>(null);
  const descriptionRef = useRef<TextInputInstance>(null);
  const { ref: scrollRef } = scrollProps;

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const empty = emptyFeedbackDraft(draft.kind);
  const dirty =
    sent === null &&
    (attachment !== null ||
      draft.title.trim() !== "" ||
      draft.description.trim() !== "" ||
      draft.stepsToReproduce.trim() !== "" ||
      draft.expectedBehavior.trim() !== "" ||
      draft.actualBehavior.trim() !== "" ||
      draft.category !== empty.category ||
      draft.severity !== empty.severity ||
      draft.rating !== empty.rating);

  // Every way out — the header's Back, Android's Back, iOS's edge swipe — is a
  // removal. Off while sending, so a send that lands is never asked about.
  usePreventRemove(dirty && !sending, ({ repeat }) => {
    Alert.alert("Discard this report?", "What you’ve written here will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => repeat() },
    ]);
  });

  const edit = useCallback(<K extends keyof FeedbackDraft>(key: K, value: FeedbackDraft[K]) => {
    setDraft((held) => ({ ...held, [key]: value }));
    setErrors((held) => {
      if (!(key in held)) return held;
      const next = { ...held };
      delete next[key as FeedbackField];
      return next;
    });
    setFailure(null);
  }, []);

  const attach = useCallback(async (source: "library" | "document") => {
    const outcome = source === "library" ? await pickFromLibrary() : await pickDocument();
    if (outcome.status !== "picked" || !live.current) return;
    const verdict = feedbackAttachmentType(outcome.attachment);
    if (!verdict.ok) {
      hapticWarning();
      Alert.alert("Can’t attach that", verdict.reason);
      return;
    }
    setAttachment({ ...outcome.attachment, type: verdict.type });
    setFailure(null);
  }, []);

  const onSubmit = useCallback(() => {
    if (sending) return;

    // Never disabled for an incomplete form, per AGENTS.md: submitting is how
    // its validation gets surfaced.
    const check = checkFeedbackDraft(draft);
    setErrors(check.errors);
    if (check.firstError) {
      hapticWarning();
      if (check.firstError === "title") titleRef.current?.focus();
      else if (check.firstError === "description") descriptionRef.current?.focus();
      else scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const fields = feedbackFields(draft, {
      platform: Platform.OS === "ios" ? "ios" : "android",
      appVersion: Constants.expoConfig?.version ?? null,
      userAgent: APP_USER_AGENT,
      locale: environmentLocale(),
      width,
      height,
    });

    setSending(true);
    setFailure(null);
    void createFeedback(fields, attachment).then((result) => {
      if (!live.current) return;
      setSending(false);
      if (!result.ok) {
        hapticWarning();
        setFailure(
          refusalSentence(result.failure, "The server answered with something this app did not understand. Try again.") ??
            null,
        );
        return;
      }
      hapticSuccess();
      setSent(feedbackSentSentence(result.value.kind, result.value.reference));
    });
  }, [attachment, draft, height, scrollRef, sending, width]);

  if (sent !== null) {
    return (
      <View className="flex-1 bg-bg">
        <InScreenHeader>
          <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
            {KIND_TITLES[draft.kind]}
          </Text>
        </InScreenHeader>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <CheckCircle color={colors.primary} size={36} />
          <Text variant="title" className="text-center text-ink" accessibilityLiveRegion="polite">
            {sent}
          </Text>
          <Text variant="meta" className="text-center text-muted">
            {draft.allowContact
              ? "We read every one, and may get in touch if we need more detail."
              : "We read every one."}
          </Text>
          <Button className="mt-4 self-stretch" onPress={() => router.back()}>
            <Text>Done</Text>
          </Button>
        </View>
      </View>
    );
  }

  const isBug = draft.kind === "bug_report";

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          {KIND_TITLES[draft.kind]}
        </Text>
      </InScreenHeader>

      <ScrollView
        className="flex-1 px-4 pt-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: screenBottomPad(insets.bottom, 24) + keyboardInset,
        }}
        {...scrollProps}
      >
        <View ref={contentRef}>
          <View accessibilityRole="tablist" className="flex-row gap-2">
            {FEEDBACK_KINDS.map((kind) => (
              <View key={kind} className="flex-1">
                <Chip
                  role="tab"
                  label={FEEDBACK_KIND_LABELS[kind]}
                  selected={draft.kind === kind}
                  onPress={() => {
                    if (draft.kind === kind) return;
                    hapticSelection();
                    setDraft((held) => withFeedbackKind(held, kind));
                    setErrors({});
                    setFailure(null);
                  }}
                />
              </View>
            ))}
          </View>

          <Text variant="label" className="mt-4 font-normal leading-5 text-muted">
            {KIND_INTROS[draft.kind]}
          </Text>

          {failure ? (
            <View className="mt-4 flex-row items-start gap-2.5 rounded-2xl border border-danger/30 bg-surface p-3.5">
              <View className="mt-0.5">
                <AlertCircle color={colors.danger} size={16} />
              </View>
              <Text
                accessibilityLiveRegion="polite"
                variant="label"
                className="min-w-0 flex-1 font-normal leading-5 text-danger"
              >
                {failure}
              </Text>
            </View>
          ) : null}

          <SectionLabel>What is it about?</SectionLabel>
          <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
            {feedbackCategories(draft.kind).map((category) => (
              <Chip
                key={category}
                label={FEEDBACK_CATEGORY_LABELS[category]}
                selected={draft.category === category}
                onPress={() => edit("category", category)}
              />
            ))}
          </View>
          <FieldError message={errors.category} />

          {isBug ? (
            <>
              <SectionLabel>How much does it get in your way?</SectionLabel>
              <View accessibilityRole="radiogroup" className="gap-2">
                {FEEDBACK_SEVERITIES.map((severity) => {
                  const selected = draft.severity === severity;
                  return (
                    <TactilePressable
                      key={severity}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${FEEDBACK_SEVERITY_LABELS[severity]}. ${FEEDBACK_SEVERITY_HINTS[severity]}`}
                      onPress={() => edit("severity", severity)}
                      className={cn(
                        "min-h-12 flex-row items-center gap-3 rounded-2xl border px-3.5 py-2.5",
                        selected ? "border-primary bg-primary-soft/50" : "border-line/80 bg-surface",
                      )}
                    >
                      <View
                        className={cn(
                          "size-5 items-center justify-center rounded-full border-2",
                          selected ? "border-primary" : "border-line",
                        )}
                      >
                        {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text variant="label" className="text-ink">
                          {FEEDBACK_SEVERITY_LABELS[severity]}
                        </Text>
                        <Text variant="meta" className="text-muted">
                          {FEEDBACK_SEVERITY_HINTS[severity]}
                        </Text>
                      </View>
                    </TactilePressable>
                  );
                })}
              </View>
              <FieldError message={errors.severity} />
            </>
          ) : (
            <>
              <SectionLabel optional>How would you rate the app?</SectionLabel>
              <View accessibilityRole="radiogroup" className="flex-row gap-1">
                {[1, 2, 3, 4, 5].map((value) => {
                  const filled = draft.rating >= value;
                  return (
                    <TactilePressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: draft.rating === value }}
                      accessibilityLabel={value === 1 ? "1 star" : `${value} stars`}
                      // A second tap on the chosen star clears it: the rating is optional.
                      onPress={() => edit("rating", draft.rating === value ? 0 : value)}
                      className="size-11 items-center justify-center rounded-full"
                    >
                      <Star
                        color={filled ? colors.amber : colors.muted}
                        fill={filled ? colors.amber : "transparent"}
                        size={26}
                      />
                    </TactilePressable>
                  );
                })}
              </View>
            </>
          )}

          <SectionLabel>Title</SectionLabel>
          <Input
            ref={titleRef}
            className="h-12 rounded-2xl font-sans text-base"
            placeholder={isBug ? "The composer freezes on long messages…" : "Let me pin conversations…"}
            accessibilityLabel="Title"
            maxLength={FEEDBACK_TITLE_MAX}
            returnKeyType="next"
            onSubmitEditing={() => descriptionRef.current?.focus()}
            value={draft.title}
            onChangeText={(value) => edit("title", value)}
          />
          <FieldError message={errors.title} />

          <SectionLabel>{isBug ? "What happened?" : "Tell us more"}</SectionLabel>
          <Input
            ref={descriptionRef}
            className={cn("h-36", MULTILINE_CLASS)}
            placeholder={isBug ? "Describe the problem…" : "What would help, and why…"}
            accessibilityLabel={isBug ? "What happened" : "Description"}
            multiline
            textAlignVertical="top"
            maxLength={FEEDBACK_DESCRIPTION_MAX}
            value={draft.description}
            onChangeText={(value) => edit("description", value)}
          />
          <FieldError message={errors.description} />

          {isBug ? (
            <>
              <SectionLabel optional>Steps to reproduce</SectionLabel>
              <Input
                className={cn("h-28", MULTILINE_CLASS)}
                placeholder={"1. Open a conversation\n2. …"}
                accessibilityLabel="Steps to reproduce"
                multiline
                textAlignVertical="top"
                maxLength={FEEDBACK_DETAIL_MAX}
                value={draft.stepsToReproduce}
                onChangeText={(value) => edit("stepsToReproduce", value)}
              />
              <SectionLabel optional>What did you expect?</SectionLabel>
              <Input
                className={cn("h-20", MULTILINE_CLASS)}
                placeholder="The message sends…"
                accessibilityLabel="What you expected"
                multiline
                textAlignVertical="top"
                maxLength={FEEDBACK_DETAIL_MAX}
                value={draft.expectedBehavior}
                onChangeText={(value) => edit("expectedBehavior", value)}
              />
              <SectionLabel optional>What happened instead?</SectionLabel>
              <Input
                className={cn("h-20", MULTILINE_CLASS)}
                placeholder="The app stops responding…"
                accessibilityLabel="What happened instead"
                multiline
                textAlignVertical="top"
                maxLength={FEEDBACK_DETAIL_MAX}
                value={draft.actualBehavior}
                onChangeText={(value) => edit("actualBehavior", value)}
              />
            </>
          ) : null}

          <SectionLabel optional>Screenshot or file</SectionLabel>
          {attachment ? (
            <View className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-line/80 bg-surface py-1.5 pl-3.5 pr-1">
              {attachment.kind === "document" ? (
                <FileText color={colors.primary} size={18} />
              ) : (
                <ImageIcon color={colors.primary} size={18} />
              )}
              <Text variant="meta" numberOfLines={1} className="min-w-0 flex-1 font-semibold text-ink">
                {attachment.name}
              </Text>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${attachment.name}`}
                onPress={() => setAttachment(null)}
                className="size-11 items-center justify-center rounded-full"
              >
                <X color={colors.muted} size={18} />
              </TactilePressable>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <Button variant="outline" size="sm" className="h-11 flex-1" onPress={() => void attach("library")}>
                <ImageIcon color={colors.ink} size={16} />
                <Text>Photo or video</Text>
              </Button>
              <Button variant="outline" size="sm" className="h-11 flex-1" onPress={() => void attach("document")}>
                <FileText color={colors.ink} size={16} />
                <Text>File</Text>
              </Button>
            </View>
          )}
          <Text variant="meta" className="mt-1.5 text-muted">
            One image, video, PDF or text file, up to 15&nbsp;MB.
          </Text>

          <TactilePressable
            accessibilityRole="switch"
            accessibilityLabel="You may contact me about this"
            accessibilityState={{ checked: draft.allowContact }}
            onPress={() => edit("allowContact", !draft.allowContact)}
            className="mt-5 min-h-14 flex-row items-center gap-3 py-2"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text variant="label" className="font-semibold text-ink">
                You may contact me about this
              </Text>
              <Text variant="meta" className="text-muted">
                If we need more detail, we’ll reach you on your account’s email.
              </Text>
            </View>
            <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Switch
                value={draft.allowContact}
                trackColor={{ false: colors.line, true: colors.primary }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.line}
              />
            </View>
          </TactilePressable>

          <Text variant="meta" className="mt-3 text-muted">
            Your app version, device and language are sent with it, to help us reproduce what you saw.
          </Text>

          <Button
            className="mt-5"
            onPress={onSubmit}
            accessibilityState={{ busy: sending }}
            disabled={sending}
          >
            {sending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
            <Text>{isBug ? "Send bug report" : "Send feedback"}</Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
