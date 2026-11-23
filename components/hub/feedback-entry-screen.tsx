import { usePreventRemove } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertCircle, Check, FileText, Paperclip } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { refusalSentence } from "@/lib/api-result";
import { formatBytes } from "@/lib/attachments";
import { attachmentKindFromType, resolveAttachmentUrl } from "@/lib/attachment-view";
import { cn } from "@/lib/cn";
import { readFeedback, updateFeedback } from "@/lib/feedback-api";
import {
  FEEDBACK_SEVERITIES,
  type AdminFeedback,
  type FeedbackAttachment,
} from "@/lib/feedback-parse";
import {
  buildTriageUpdate,
  triageDraftFor,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_RESPONSE_MAX,
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_STATUS_OPTIONS,
  type TriageDraft,
} from "@/lib/feedback-rules";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { colors, screenBottomPad } from "@/lib/tokens";
import { useOpenDocument } from "@/lib/use-open-document";

/**
 * One bug report or piece of feedback, read in full and triaged: its status,
 * a bug's severity, an internal note nobody but the super admin reads, and the
 * response. Only what changed is sent (`buildTriageUpdate`), because the API
 * records whoever writes as the handler.
 *
 * Read fresh on the way in rather than handed over from the list, so an entry
 * somebody triaged on the web a moment ago is not saved over from a stale copy.
 */

const MULTILINE_CLASS =
  "h-24 rounded-2xl border-line/80 bg-line/35 px-3.5 py-3 font-sans text-base text-ink";

function formatWhen(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="gap-0.5">
      <Text variant="label" className="text-muted">
        {label}
      </Text>
      <Text variant="body" selectable className="text-ink">
        {value}
      </Text>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TactilePressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
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

function AttachmentRow({ attachment }: { attachment: FeedbackAttachment }) {
  const name = attachment.fileName ?? attachment.url.split("/").pop() ?? "Attachment";
  const { open, opening } = useOpenDocument({
    uri: resolveAttachmentUrl(attachment.url),
    name,
    size: attachment.size,
    kind: attachmentKindFromType(attachment.mimeType),
  });
  const size = formatBytes(attachment.size);

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      accessibilityState={{ busy: opening }}
      onPress={open}
      className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-line/80 bg-surface px-3.5 py-2"
    >
      <FileText color={colors.primary} size={18} />
      <View className="min-w-0 flex-1">
        <Text variant="meta" numberOfLines={1} className="font-semibold text-ink">
          {name}
        </Text>
        <Text variant="meta" className="text-muted">
          {[attachment.mimeType, size].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {opening ? <ActivityIndicator size="small" color={colors.primary} /> : null}
    </TactilePressable>
  );
}

export function FeedbackEntryScreen({ id }: { id: string | undefined }) {
  const insets = useSafeAreaInsets();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();

  const [entry, setEntry] = useState<AdminFeedback | null>(null);
  const [draft, setDraft] = useState<TriageDraft | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setLoadFailure("This entry could not be found.");
      return;
    }
    setLoading(true);
    setLoadFailure(null);
    const result = await readFeedback(id);
    if (!live.current) return;
    setLoading(false);
    if (!result.ok) {
      setLoadFailure(refusalSentence(result.failure, "This entry could not be read."));
      return;
    }
    setEntry(result.value);
    setDraft(triageDraftFor(result.value));
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the read this screen opens on; `live` drops an answer that lands after it has gone.
    void load();
  }, [load]);

  const update = entry && draft ? buildTriageUpdate(entry, draft) : null;

  usePreventRemove(update !== null && !saving, ({ repeat }) => {
    Alert.alert("Discard your changes?", "The triage you haven’t saved will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => repeat() },
    ]);
  });

  const edit = useCallback(<K extends keyof TriageDraft>(key: K, value: TriageDraft[K]) => {
    setDraft((held) => (held ? { ...held, [key]: value } : held));
    setSaveFailure(null);
    setSaved(false);
  }, []);

  const onSave = useCallback(() => {
    if (saving || !entry || !update) return;
    setSaving(true);
    setSaveFailure(null);
    void updateFeedback(entry.id, update).then((result) => {
      if (!live.current) return;
      setSaving(false);
      if (!result.ok) {
        hapticWarning();
        setSaveFailure(refusalSentence(result.failure, "The triage could not be saved."));
        return;
      }
      hapticSuccess();
      setEntry(result.value);
      setDraft(triageDraftFor(result.value));
      setSaved(true);
    });
  }, [entry, saving, update]);

  if (loading && !entry) {
    return (
      <View accessibilityLabel="Loading entry" className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!entry || !draft) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-bg px-8">
        <AlertCircle color={colors.muted} size={28} />
        <Text variant="title" className="text-center text-ink">
          This entry could not be opened
        </Text>
        {loadFailure ? (
          <Text variant="meta" className="text-center text-muted">
            {loadFailure}
          </Text>
        ) : null}
        {id ? (
          <Button variant="outline" onPress={() => void load()}>
            <Text>Try again</Text>
          </Button>
        ) : null}
      </View>
    );
  }

  const isBug = entry.kind === "bug_report";
  const environment = [
    entry.platform === "ios" ? "iOS" : entry.platform === "android" ? "Android" : entry.platform === "web" ? "Web" : null,
    entry.appVersion ? `v${entry.appVersion}` : null,
    entry.locale,
    entry.viewport,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView
      className="flex-1 bg-bg px-4 pt-4"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: screenBottomPad(insets.bottom, 24) + keyboardInset }}
      {...scrollProps}
    >
      <View ref={contentRef} className="gap-4">
        <View className="gap-3 rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/5">
          <Text variant="label" className="uppercase tracking-wider text-muted">
            {[entry.reference, FEEDBACK_KIND_LABELS[entry.kind], entry.category ? FEEDBACK_CATEGORY_LABELS[entry.category] : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <Text variant="headline" selectable className="text-ink">
            {entry.title}
          </Text>
          <Text variant="body" selectable className="text-ink">
            {entry.description}
          </Text>
          {entry.rating !== null ? <Detail label="Rating" value={`${entry.rating} / 5`} /> : null}
          <Detail label="Steps to reproduce" value={entry.stepsToReproduce} />
          <Detail label="Expected" value={entry.expectedBehavior} />
          <Detail label="Actual" value={entry.actualBehavior} />

          {entry.attachments.length > 0 ? (
            <View className="gap-2">
              <View className="flex-row items-center gap-1.5">
                <Paperclip color={colors.muted} size={14} />
                <Text variant="label" className="text-muted">
                  Attachments
                </Text>
              </View>
              {entry.attachments.map((attachment) => (
                <AttachmentRow key={attachment.url} attachment={attachment} />
              ))}
            </View>
          ) : null}
        </View>

        <View className="gap-3 rounded-3xl border border-line/70 bg-surface p-4">
          <Detail
            label="Reported by"
            value={
              entry.reporter
                ? `${entry.reporter.name}${entry.reporter.email ? ` (${entry.reporter.email})` : ""}`
                : "An account that has been deleted"
            }
          />
          <Detail label="Contact" value={entry.allowContact ? "Happy to be contacted" : "Asked not to be contacted"} />
          <Detail label="Sent" value={formatWhen(entry.createdAt)} />
          <Detail label="Device" value={environment || null} />
          <Detail label="User agent" value={entry.userAgent} />
          <Detail label="Page" value={entry.pageUrl} />
          <Detail label="Handled by" value={entry.handledBy?.name ?? null} />
          <Detail label="Closed" value={formatWhen(entry.resolvedAt)} />
        </View>

        <View className="gap-3 rounded-3xl border border-line/70 bg-surface p-4">
          <Text variant="label" className="uppercase tracking-wider text-muted">
            Triage
          </Text>

          <Text variant="label" className="text-ink">
            Status
          </Text>
          <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
            {FEEDBACK_STATUS_OPTIONS.map((option) => (
              <Choice
                key={option.status}
                label={option.label}
                selected={draft.status === option.status}
                onPress={() => edit("status", option.status)}
              />
            ))}
          </View>

          {isBug ? (
            <>
              <Text variant="label" className="text-ink">
                Severity
              </Text>
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                {FEEDBACK_SEVERITIES.map((severity) => (
                  <Choice
                    key={severity}
                    label={FEEDBACK_SEVERITY_LABELS[severity]}
                    selected={draft.severity === severity}
                    onPress={() => edit("severity", severity)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Text variant="label" className="text-ink">
            Internal note
          </Text>
          <Input
            className={MULTILINE_CLASS}
            placeholder="Only you can read this…"
            accessibilityLabel="Internal note"
            multiline
            textAlignVertical="top"
            maxLength={FEEDBACK_RESPONSE_MAX}
            value={draft.internalNote}
            onChangeText={(value) => edit("internalNote", value)}
          />

          <Text variant="label" className="text-ink">
            Response
          </Text>
          <Input
            className={MULTILINE_CLASS}
            placeholder="What was done about it…"
            accessibilityLabel="Response"
            multiline
            textAlignVertical="top"
            maxLength={FEEDBACK_RESPONSE_MAX}
            value={draft.response}
            onChangeText={(value) => edit("response", value)}
          />

          {saveFailure ? (
            <View className="flex-row items-start gap-2" accessibilityLiveRegion="polite">
              <AlertCircle color={colors.danger} size={16} />
              <Text variant="label" className="min-w-0 flex-1 font-normal text-danger">
                {saveFailure}
              </Text>
            </View>
          ) : saved ? (
            <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
              <Check color={colors.primary} size={16} />
              <Text variant="label" className="font-normal text-ink">
                Saved
              </Text>
            </View>
          ) : null}

          <Button
            onPress={onSave}
            disabled={saving || update === null}
            accessibilityState={{ busy: saving, disabled: saving || update === null }}
          >
            {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
            <Text>Save</Text>
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}
