import { usePreventRemove } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  View,
  type TextInputInstance,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertCircle, Camera, Check, Trash2 } from "@/components/icons";
import { InScreenHeader } from "@/components/in-screen-header";
import { ProfilePhoto } from "@/components/settings/profile-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { confirmDiscardProfile, confirmRemovePhoto } from "@/lib/confirm-profile";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useKeyboardAwareScroll } from "@/lib/keyboard-inset";
import { removeProfilePhoto, updateProfile, uploadProfilePhoto } from "@/lib/profile-api";
import { pickProfilePhoto } from "@/lib/profile-photo-picker";
import {
  checkProfile,
  draftFromUser,
  hasProfileChanges,
  NAME_MAX_LENGTH,
  PHONE_HINT,
  profilePhotoUpload,
  profileRefusal,
  USERNAME_HINT,
  USERNAME_MAX_LENGTH,
  type ProfileDraft,
  type ProfileField,
} from "@/lib/profile-rules";
import { colors, screenBottomPad } from "@/lib/tokens";

/**
 * The signed-in person's own name, username, phone and photo, reached from the
 * header card on Settings.
 *
 * The web client's profile form, with the photo it draws and offers no way to
 * change: the API has had `POST` and `DELETE /auth/profile/avatar` all along.
 * A sibling of the other account screens and outside the role groups, per
 * ADR-0012, so nothing here reads a role.
 *
 * ## Two kinds of write
 *
 * The fields are a draft saved together by one button, because `PUT
 * /auth/profile` is a replace of all three. The photo is not part of the draft:
 * choosing one uploads it there and then, the way every app with an avatar
 * behaves, and it has its own spinner and its own line for what went wrong, so
 * a refused photo never reads as a refused name.
 *
 * Either kind hands the re-read person to `accountUpdated`, which is what
 * redraws the Settings header behind this screen at once. `lib/profile-api`
 * brings the module mirror and the Kept person into line.
 *
 * Email is shown and not editable, as on the web: changing it is a
 * verification flow the API does not offer here.
 */

const LABELS: Record<ProfileField, string> = {
  name: "Name",
  username: "Username",
  phone: "Phone",
};

/** One labelled field with its hint, replaced by its error when there is one. */
function ProfileInput({
  field,
  value,
  error,
  hint,
  inputRef,
  onChangeText,
  onSubmitEditing,
  returnKeyType,
  editable,
  ...native
}: {
  field: ProfileField;
  value: string;
  error: string | undefined;
  hint?: string;
  inputRef: React.RefObject<TextInputInstance | null>;
  onChangeText: (next: string) => void;
  onSubmitEditing: () => void;
  returnKeyType: "next" | "done";
  editable: boolean;
} & Pick<
  TextInputProps,
  | "autoCapitalize"
  | "autoComplete"
  | "textContentType"
  | "keyboardType"
  | "maxLength"
  | "placeholder"
>) {
  const label = LABELS[field];

  return (
    <View className="mt-4">
      <Text variant="label" className="mb-1.5 text-ink">
        {label}
      </Text>
      <Input
        ref={inputRef}
        className="h-12 rounded-2xl border-line/80 bg-line/35 font-sans text-base text-ink"
        accessibilityLabel={label}
        accessibilityHint={hint}
        autoCorrect={false}
        spellCheck={field === "name"}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        submitBehavior={returnKeyType === "next" ? "submit" : "blurAndSubmit"}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        {...native}
      />
      {error ? (
        <View className="mt-1.5 flex-row items-center gap-1.5" accessibilityLiveRegion="polite">
          <AlertCircle color={colors.danger} size={14} />
          <Text variant="label" className="min-w-0 flex-1 font-medium text-danger">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="label" className="mt-1.5 font-normal leading-5 text-muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A sentence in a tinted box: what went wrong, or what just went right. */
function Notice({ tone, children }: { tone: "danger" | "success"; children: string }) {
  const danger = tone === "danger";
  return (
    <View
      className={
        danger
          ? "mt-4 flex-row items-start gap-2.5 rounded-2xl border border-danger/30 bg-surface p-3.5"
          : "mt-4 flex-row items-start gap-2.5 rounded-2xl border border-line/70 bg-primary-soft/40 p-3.5"
      }
    >
      <View className="mt-0.5">
        {danger ? (
          <AlertCircle color={colors.danger} size={16} />
        ) : (
          <Check color={colors.primary} size={16} />
        )}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        variant="label"
        className={
          danger
            ? "min-w-0 flex-1 font-normal leading-5 text-danger"
            : "min-w-0 flex-1 font-normal leading-5 text-ink"
        }
      >
        {children}
      </Text>
    </View>
  );
}

export function AccountProfileScreen() {
  const insets = useSafeAreaInsets();
  const { keyboardInset, contentRef, scrollProps } = useKeyboardAwareScroll();
  const { state, accountUpdated } = useAuth();
  const account = state.status === "signed-in" ? state.user : null;

  // Seeded once. A photo upload replaces the person under this screen, and
  // re-seeding then would throw away whatever somebody was in the middle of
  // typing; a save re-seeds explicitly from its own answer.
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    draftFromUser(account ?? { name: "", username: null, phone: null }),
  );
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [photoBusy, setPhotoBusy] = useState<"upload" | "remove" | null>(null);
  const [photoFailure, setPhotoFailure] = useState<string | null>(null);

  const nameRef = useRef<TextInputInstance>(null);
  const usernameRef = useRef<TextInputInstance>(null);
  const phoneRef = useRef<TextInputInstance>(null);

  const focusField = useCallback((field: ProfileField) => {
    const target = field === "name" ? nameRef : field === "username" ? usernameRef : phoneRef;
    target.current?.focus();
  }, []);

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const dirty = account !== null && hasProfileChanges(draft, account);

  // Every way out — the header's Back, Android's Back, iOS's edge swipe — is a
  // removal, and removal prevention sees all three. Off while a save is out,
  // so a save that lands and then a Back is not asked about. Discard puts the
  // draft back to what is saved, which is what turns the prevention off before
  // `repeat` lets the removal through.
  usePreventRemove(dirty && !saving, ({ repeat }) => {
    void confirmDiscardProfile().then((discard) => {
      if (!discard || !live.current || account === null) return;
      setDraft(draftFromUser(account));
      repeat();
    });
  });

  const edit = useCallback((field: ProfileField, value: string) => {
    setDraft((held) => ({ ...held, [field]: value }));
    // The complaint about a field goes the moment somebody acts on it.
    setErrors((held) => {
      if (held[field] === undefined) return held;
      const next = { ...held };
      delete next[field];
      return next;
    });
    setFailure(null);
    setSaved(false);
  }, []);

  const onSave = useCallback(() => {
    if (saving || account === null) return;

    // Never disabled for an incomplete form, per AGENTS.md: submitting it is
    // how its validation reaches somebody.
    const check = checkProfile(draft);
    setErrors(check.errors);
    if (check.submission === null) {
      hapticWarning();
      if (check.firstError) focusField(check.firstError);
      return;
    }

    setSaving(true);
    setFailure(null);
    setSaved(false);

    void updateProfile(check.submission).then((result) => {
      if (!live.current) return;
      setSaving(false);

      if (!result.ok) {
        hapticWarning();
        const refusal = profileRefusal(result.failure);
        if (refusal.field !== null) {
          setErrors({ [refusal.field]: refusal.message });
          focusField(refusal.field);
        } else {
          setFailure(refusal.message);
        }
        return;
      }

      hapticSuccess();
      accountUpdated(result.value);
      setDraft(draftFromUser(result.value));
      setSaved(true);
    });
  }, [account, accountUpdated, draft, focusField, saving]);

  const onChangePhoto = useCallback(async () => {
    if (photoBusy) return;
    setPhotoFailure(null);

    const picked = await pickProfilePhoto();
    if (!picked || !live.current) return;

    const upload = profilePhotoUpload(picked);
    if (!upload.ok) {
      hapticWarning();
      setPhotoFailure(upload.message);
      return;
    }

    setPhotoBusy("upload");
    const result = await uploadProfilePhoto(upload.file);
    if (!live.current) return;
    setPhotoBusy(null);

    if (!result.ok) {
      hapticWarning();
      setPhotoFailure(profileRefusal(result.failure).message);
      return;
    }
    hapticSuccess();
    accountUpdated(result.value);
  }, [accountUpdated, photoBusy]);

  const onRemovePhoto = useCallback(async () => {
    if (photoBusy) return;
    setPhotoFailure(null);
    if (!(await confirmRemovePhoto()) || !live.current) return;

    setPhotoBusy("remove");
    const result = await removeProfilePhoto();
    if (!live.current) return;
    setPhotoBusy(null);

    if (!result.ok) {
      hapticWarning();
      setPhotoFailure(profileRefusal(result.failure).message);
      return;
    }
    hapticSuccess();
    accountUpdated(result.value);
  }, [accountUpdated, photoBusy]);

  const displayName = account?.name ?? "";

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          Profile
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
          <View className="items-center">
            <View>
              <ProfilePhoto
                name={displayName}
                image={account?.image}
                className="size-24"
                textVariant="display"
              />
              {photoBusy ? (
                <View
                  className="absolute inset-0 items-center justify-center rounded-full bg-black/35"
                  accessibilityLabel={photoBusy === "upload" ? "Uploading photo…" : "Removing photo…"}
                >
                  <ActivityIndicator color={colors.primaryForeground} />
                </View>
              ) : null}
            </View>

            <View className="mt-3 flex-row flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                accessibilityState={{ disabled: photoBusy !== null }}
                disabled={photoBusy !== null}
                onPress={() => void onChangePhoto()}
              >
                <Camera color={colors.ink} size={16} />
                <Text className="text-ink">{account?.image ? "Change photo" : "Add a photo"}</Text>
              </Button>
              {account?.image ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  accessibilityState={{ disabled: photoBusy !== null }}
                  disabled={photoBusy !== null}
                  onPress={() => void onRemovePhoto()}
                >
                  <Trash2 color={colors.danger} size={16} />
                  <Text className="text-danger">Remove</Text>
                </Button>
              ) : null}
            </View>
            <Text variant="label" className="mt-1.5 text-center font-normal leading-5 text-muted">
              JPEG, PNG, GIF or WebP, up to 2 MB.
            </Text>
          </View>

          {photoFailure ? <Notice tone="danger">{photoFailure}</Notice> : null}
          {failure ? <Notice tone="danger">{failure}</Notice> : null}
          {saved ? <Notice tone="success">Profile saved.</Notice> : null}

          <ProfileInput
            field="name"
            value={draft.name}
            error={errors.name}
            inputRef={nameRef}
            returnKeyType="next"
            onChangeText={(value) => edit("name", value)}
            onSubmitEditing={() => usernameRef.current?.focus()}
            editable={!saving}
            placeholder="Full name…"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={NAME_MAX_LENGTH}
          />

          <ProfileInput
            field="username"
            value={draft.username}
            error={errors.username}
            hint={USERNAME_HINT}
            inputRef={usernameRef}
            returnKeyType="next"
            onChangeText={(value) => edit("username", value)}
            onSubmitEditing={() => phoneRef.current?.focus()}
            editable={!saving}
            placeholder="jordan_lee…"
            autoCapitalize="none"
            autoComplete="username"
            textContentType="username"
            maxLength={USERNAME_MAX_LENGTH}
          />

          <ProfileInput
            field="phone"
            value={draft.phone}
            error={errors.phone}
            hint={PHONE_HINT}
            inputRef={phoneRef}
            returnKeyType="done"
            onChangeText={(value) => edit("phone", value)}
            onSubmitEditing={onSave}
            editable={!saving}
            placeholder="+14155552671…"
            autoCapitalize="none"
            autoComplete="tel"
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            maxLength={32}
          />

          {/* Shown as text rather than a disabled field, which would read as a
              control somebody could be allowed to use. */}
          <View className="mt-4">
            <Text variant="label" className="mb-1.5 text-ink">
              Email
            </Text>
            <View className="min-h-12 justify-center rounded-2xl border border-line/50 px-3">
              <Text
                variant="meta"
                className="text-ink-soft"
                numberOfLines={1}
                selectable
                accessibilityLabel={`Email, ${account?.email ?? ""}, cannot be changed here`}
              >
                {account?.email ?? ""}
              </Text>
            </View>
          </View>

          <Button
            className="mt-6 min-h-12"
            accessibilityLabel="Save profile"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={onSave}
          >
            {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
            <Text>Save</Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
