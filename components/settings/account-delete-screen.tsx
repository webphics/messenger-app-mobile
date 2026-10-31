import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertCircle, LogOut, Trash2 } from "@/components/icons";
import { InScreenHeader } from "@/components/in-screen-header";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { deletionNotice, type DeletionNotice } from "@/lib/account-deletion";
import { deleteAccount } from "@/lib/account-deletion-api";
import { useAuth } from "@/lib/auth-context";
import { confirmDeleteAccount } from "@/lib/confirm-delete-account";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { colors, screenBottomPad } from "@/lib/tokens";

/**
 * Deleting this account, which the App Store and Google Play require of an app
 * that creates accounts. Reached from the account card on Settings, so every
 * role has it; the API refuses the two accounts that may not go (the workspace
 * owner and the last admin) and this screen shows its sentence.
 *
 * Two steps, per AGENTS.md's rule on destructive actions: this screen says what
 * goes and what stays, and the button on it asks once more in a system dialog.
 *
 * A deletion that succeeds signs out through `useAuth().signOut`, the path every
 * other session end takes: `lib/session-wipe` clears the Store, the downloaded
 * documents and the push registration, and `components/auth/session-end` lands
 * on sign-in. Nothing here navigates.
 *
 * The lists are the API's behaviour, written down in
 * `api/docs/planning/account-deletion.md`. Change both together.
 */
const REMOVED = [
  "Your name, email address, phone number, username and photo",
  "Your password, your Google and Apple sign-ins, and two-factor settings",
  "Your memberships in organizations and any invitations waiting for you",
  "Your notifications, and every device signed in to this account",
];

const KEPT =
  "Messages you sent stay in the conversations they were sent to, because they are part of the other people’s history. They show as from a deleted account, without your name.";

function Bullets({ items }: { items: string[] }) {
  return (
    <View className="mt-2 gap-1.5">
      {items.map((item) => (
        <View key={item} className="flex-row gap-2">
          <Text variant="label" className="font-normal leading-5 text-muted" aria-hidden>
            •
          </Text>
          <Text variant="label" className="min-w-0 flex-1 font-normal leading-5 text-ink">
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function AccountDeleteScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<DeletionNotice | null>(null);

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onDelete = useCallback(async () => {
    if (deleting) return;
    if (!(await confirmDeleteAccount())) return;

    setDeleting(true);
    setNotice(null);

    const result = await deleteAccount();

    if (result.ok) {
      hapticSuccess();
      await signOut();
      return;
    }

    if (!live.current) return;
    setDeleting(false);
    hapticWarning();
    setNotice(deletionNotice(result.failure));
  }, [deleting, signOut]);

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          Delete account
        </Text>
      </InScreenHeader>

      <ScrollView
        className="flex-1 px-4 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: screenBottomPad(insets.bottom, 24) }}
      >
        <Text variant="label" className="font-normal leading-5 text-muted">
          Your account is deleted as soon as you confirm. You can’t undo it, and
          signing up again with the same email address starts a new, empty
          account.
        </Text>

        <View className="mt-4 rounded-3xl border border-line bg-surface p-4">
          <Text variant="meta" className="font-semibold text-ink">
            What is deleted
          </Text>
          <Bullets items={REMOVED} />

          <Text variant="meta" className="mt-4 font-semibold text-ink">
            What stays
          </Text>
          <Text variant="label" className="mt-2 font-normal leading-5 text-ink">
            {KEPT}
          </Text>
        </View>

        {notice ? (
          <View className="mt-4 flex-row items-start gap-2.5 rounded-2xl border border-danger/30 bg-surface p-3.5">
            <View className="mt-0.5">
              <AlertCircle color={colors.danger} size={16} />
            </View>
            <Text
              accessibilityLiveRegion="polite"
              variant="label"
              className="min-w-0 flex-1 font-normal leading-5 text-danger"
            >
              {notice.message}
            </Text>
          </View>
        ) : null}

        {notice?.kind === "reauthenticate" ? (
          // The way past a session that is too old to delete from. Signing out
          // here is the ordinary sign-out, wipe and all; signing back in gives a
          // fresh session, and the row on Settings brings them back here.
          <Button
            variant="outline"
            className="mt-6 min-h-12"
            onPress={() => {
              void signOut();
            }}
          >
            <LogOut color={colors.ink} size={18} />
            <Text>Sign out and sign in again</Text>
          </Button>
        ) : (
          <Button
            variant="destructive"
            className="mt-6 min-h-12"
            accessibilityLabel="Delete my account"
            accessibilityState={{ disabled: deleting }}
            disabled={deleting}
            onPress={() => {
              void onDelete();
            }}
          >
            {deleting ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Trash2 color={colors.primaryForeground} size={18} />
            )}
            <Text>Delete my account</Text>
          </Button>
        )}
      </ScrollView>
    </View>
  );
}
