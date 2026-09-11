import { ActivityIndicator, View } from "react-native";

import { Building2 } from "@/components/icons";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { useConversationInbox } from "@/lib/conversation-inbox";
import { colors } from "@/lib/tokens";
import { useInvitations } from "@/lib/use-invitations";

/**
 * The invitations waiting for an answer.
 *
 * On Settings because every role can be invited — an organization is the
 * container everything in this product belongs to — and drawn only when
 * there is something to answer, which is what makes a card appearing here
 * mean something. Nothing announces a failure to load: see `useInvitations`.
 *
 * Accepting changes what this person can see, so the conversation list is
 * resynced behind it. Nothing waits for that; the card has already removed
 * the row it was about.
 */
export function InvitationsCard() {
  const { reload } = useConversationInbox();
  const view = useInvitations(reload);

  if (view.invitations.length === 0) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      className="mb-4 rounded-3xl border border-primary/25 bg-surface p-4 shadow-md shadow-black/5"
    >
      <View className="mb-3 flex-row items-center gap-2 border-b border-line/60 pb-3">
        <Building2 color={colors.primary} size={16} />
        <Text variant="label" className="uppercase tracking-wider text-ink-soft">
          {view.invitations.length === 1
            ? "1 invitation"
            : `${view.invitations.length} invitations`}
        </Text>
      </View>

      <View className="gap-3">
        {view.invitations.map((invitation) => {
          const busy = view.busyId === invitation.id;
          return (
            <View key={invitation.id} className="gap-2">
              <Text variant="meta" className="font-semibold text-ink">
                {invitation.organization.name}
              </Text>
              <View className="flex-row items-center gap-2">
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel={`Join ${invitation.organization.name}`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => view.accept(invitation)}
                  className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary"
                >
                  {busy ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : null}
                  <Text variant="label" className="font-semibold text-primary-foreground">
                    Join
                  </Text>
                </TactilePressable>
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${invitation.organization.name}`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => view.decline(invitation)}
                  className="min-h-11 flex-1 items-center justify-center rounded-xl border border-line/80 bg-line/35"
                >
                  <Text variant="label" className="text-ink">
                    Decline
                  </Text>
                </TactilePressable>
              </View>
            </View>
          );
        })}
      </View>

      {view.error ? (
        <Text variant="label" className="mt-3 text-danger">
          {view.error}
        </Text>
      ) : null}
    </View>
  );
}
