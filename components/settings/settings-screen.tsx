import { LogOut } from "@/components/icons";
import Constants from "expo-constants";
import { ScrollView, View } from "react-native";

import { AccountCard } from "@/components/settings/account-card";
import { InvitationsCard } from "@/components/settings/invitations-card";
import { LegalCard } from "@/components/settings/legal-card";
import { NotificationPermissionRow } from "@/components/settings/notification-permission-row";
import { PostNotificationsCard } from "@/components/settings/post-notifications-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth-context";
import { confirmSignOut } from "@/lib/confirm-sign-out";
import { getDevUser } from "@/lib/dev-user";
import { initials } from "@/lib/display";
import { hubEyebrow } from "@/lib/hub-chrome";
import {
  makeRefreshControl,
  useSimulatedRefresh,
} from "@/lib/simulated-refresh";
import { colors } from "@/lib/tokens";

export function SettingsScreen() {
  const me = getDevUser();
  const { state, signOut } = useAuth();
  // The signed-in person, read from the provider rather than the module mirror so
  // this card re-renders the moment they sign out instead of showing their name
  // and email until the navigation lands.
  const account = state.status === "signed-in" ? state.user : null;
  // Falls back to the mock person only when there is no signed-in name to show,
  // so this card never pairs a fixture's name with a real email address.
  const displayName = account?.name ?? me.displayName;
  const { refreshing, onRefresh } = useSimulatedRefresh(() => {});

  async function onSignOut() {
    if (await confirmSignOut()) await signOut();
  }

  return (
    <ScrollView
      className="flex-1 bg-bg px-4 pt-4"
      showsVerticalScrollIndicator={false}
      refreshControl={makeRefreshControl(refreshing, onRefresh)}
    >
      <View
        className="flex-row items-center gap-3.5 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
      >
        <Avatar alt={displayName} className="size-14">
          <AvatarFallback className="bg-primary-soft">
            <Text variant="headline" className="text-primary">
              {initials(displayName)}
            </Text>
          </AvatarFallback>
        </Avatar>

        <View className="min-w-0 flex-1">
          <Text variant="headline" className="text-ink" numberOfLines={1}>
            {displayName}
          </Text>
          {/* Dropped rather than emptied. There is no fixture address to fall
              back to that would not be a lie, and an empty Text still takes a
              line's height — so the card would carry a blank gap under the name
              for the frame between signing out and the navigation landing. */}
          {account?.email ? (
            <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
              {account.email}
            </Text>
          ) : null}
          <View className="mt-1.5 self-start rounded-full bg-primary-soft px-2.5 py-0.5">
            <Text variant="label" className="font-bold uppercase tracking-wider text-primary">
              {hubEyebrow(account?.role ?? "customer")}
            </Text>
          </View>
        </View>
      </View>

      {/* Above Application because it is the one thing here that is waiting
          on an answer, and it draws nothing at all when there is none. */}
      <View className="mt-4" />
      <InvitationsCard />

      {/* Every role, because nothing here branches on one: governing your own
          account belongs to the account rather than to the role, and this
          component is already the one shared screen all three groups render.
          See `docs/adr/ADR-0012-account-self-service-is-pushed-from-settings.md`
          and root ADR 0008. Above Application because it is about this person,
          and above Sign out because the sessions screen behind it is where
          somebody goes to end a session that is not this device, while Sign out
          below ends the one that is. */}
      <AccountCard />

      {/* Static rows that leave the app, so nothing here arrives late above
          Sign out. The privacy policy has to be reachable from inside the app,
          not only from the store listing. */}
      <LegalCard />

      <View
        className="mb-4 rounded-3xl border border-line bg-surface p-4 shadow-md shadow-black/5"
      >
        <View className="mb-4 flex-row items-center justify-between border-b border-line/60 pb-3">
          <Text variant="label" className="uppercase tracking-wider text-muted">
            Application
          </Text>
          <Text variant="label" className="font-medium text-ink-soft">
            ChatRoute v{Constants.expoConfig?.version}
          </Text>
        </View>

        <Button
          variant="outline"
          className="min-h-12 border-danger/30 active:bg-danger/10"
          // No navigation here: `components/auth/session-end` takes every ending
          // of a session to sign-in, so this path and an expiry land identically.
          onPress={() => {
            void onSignOut();
          }}
        >
          <LogOut color={colors.danger} size={18} />
          <Text className="text-danger">Sign out</Text>
        </Button>
      </View>

      {/* The two notification settings, together and last. Below Sign out
          because the second of them is settled a frame or two after this screen
          draws and nothing that arrives late belongs above a destructive
          control somebody is already reaching for — and the first is here too
          rather than further up because they are one subject: the sentence
          under the switches that says notifications are off is the sentence the
          row beneath offers the way out of. Nothing under them moves when the
          row appears. */}
      <PostNotificationsCard />
      <NotificationPermissionRow />
    </ScrollView>
  );
}
