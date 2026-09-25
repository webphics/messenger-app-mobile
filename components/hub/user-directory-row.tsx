import { memo, useCallback, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import {
  Ban,
  Building2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  LogOut,
  MailPlus,
  ShieldCheck,
  Trash2,
  UserCog,
} from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/display";
import { disclosureEnter } from "@/lib/motion-enter";
import { colors } from "@/lib/tokens";
import {
  invitableOrganizations,
  isSelf,
  membershipSummary,
  otherRoles,
  userDisplayName,
  userFlags,
  userRoleLabel,
} from "@/lib/user-directory";
import type { UserDirectoryView } from "@/lib/use-user-directory";
import type { ManagedUser, OrganizationSummary, UserRole } from "@/lib/types";

/**
 * One account, and everything an Admin can do to it.
 *
 * Collapsed it is a name, a role and whatever is notable — a ban, an
 * unverified email, live sessions. Expanded it is the actions, in the order
 * they are reached for: where somebody belongs, what they are, and then the
 * three that end something.
 *
 * An Admin's own row carries none of them. The API permits self-demotion,
 * self-ban and self-delete — it asks only that the actor is an Admin — and a
 * phone is the worst place to discover that, so this is a rule the client
 * adds. See `isSelf`.
 */

const FLAG_STYLE = {
  danger: { chip: "bg-danger/15", ink: "text-danger" },
  warning: { chip: "bg-amber/15", ink: "text-amber" },
  success: { chip: "bg-success/15", ink: "text-success" },
  neutral: { chip: "bg-line/70", ink: "text-muted" },
} as const;

const ROLE_STYLE: Record<UserRole, { chip: string; ink: string }> = {
  admin: { chip: "bg-primary-soft", ink: "text-primary" },
  agent: { chip: "bg-amber/15", ink: "text-amber" },
  customer: { chip: "bg-line/70", ink: "text-muted" },
};

type UserDirectoryRowProps = {
  user: ManagedUser;
  open: boolean;
  onToggle: (userId: string) => void;
  viewerId: string | null;
  organizations: OrganizationSummary[];
  actions: UserDirectoryView;
};

function ActionButton({
  label,
  icon: Icon,
  tone = "neutral",
  onPress,
}: {
  label: string;
  icon: typeof Ban;
  tone?: "neutral" | "danger";
  onPress: () => void;
}) {
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(
        "min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-3",
        tone === "danger"
          ? "border-danger/30 bg-danger/10"
          : "border-line/80 bg-line/35",
      )}
    >
      <Icon color={tone === "danger" ? colors.danger : colors.ink} size={15} />
      <Text
        variant="label"
        className={tone === "danger" ? "text-danger" : "text-ink"}
      >
        {label}
      </Text>
    </TactilePressable>
  );
}

export const UserDirectoryRow = memo(function UserDirectoryRow({
  user,
  open,
  onToggle,
  viewerId,
  organizations,
  actions,
}: UserDirectoryRowProps) {
  const reduceMotion = useReducedMotion();
  const [password, setPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);

  const name = userDisplayName(user);
  const flags = userFlags(user);
  const role = ROLE_STYLE[user.role];
  const own = isSelf(user, viewerId);
  const busy = actions.busyId === user.id;
  const problem = actions.refusal?.id === user.id ? actions.refusal.message : null;
  const invitable = invitableOrganizations(organizations, user);
  /** A customer joins on being invited (ADR 0013), so the control does not say Invite. */
  const joinsOnInvite = user.role === "customer";

  const handleToggle = useCallback(() => onToggle(user.id), [onToggle, user.id]);

  const confirmBan = useCallback(() => {
    Alert.alert(
      `Ban ${name}?`,
      "They are signed out everywhere and cannot sign in again until the ban is lifted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Ban", style: "destructive", onPress: () => actions.ban(user) },
      ],
    );
  }, [actions, name, user]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      `Delete ${name}?`,
      "The account goes for good. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => actions.remove(user) },
      ],
    );
  }, [actions, name, user]);

  const confirmRevoke = useCallback(() => {
    Alert.alert(`Sign ${name} out everywhere?`, "Every device they are signed in on.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", onPress: () => actions.revokeSessions(user) },
    ]);
  }, [actions, name, user]);

  const confirmTwoFactor = useCallback(() => {
    Alert.alert(
      `Reset two-factor for ${name}?`,
      "Their second factor is cleared and they are signed out everywhere, so they can set a new one up.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", onPress: () => actions.resetTwoFactor(user) },
      ],
    );
  }, [actions, name, user]);

  const submitPassword = useCallback(() => {
    const next = password.trim();
    if (!next) return;
    actions.resetPassword(user, next);
    setPassword("");
    setSettingPassword(false);
  }, [actions, password, user]);

  // No entrance: a FlatList mounts this row on every scroll into the window.
  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ expanded: open }}
      onPress={handleToggle}
      className={cn(
        "rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8",
        busy && "opacity-70",
      )}
    >
      <View className="flex-row items-center gap-3.5">
        <Avatar alt={name} className="size-12">
          <AvatarFallback className={role.chip}>
            <Text variant="title" className={role.ink}>
              {initials(name)}
            </Text>
          </AvatarFallback>
        </Avatar>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              variant="title"
              className="min-w-0 shrink text-ink"
              numberOfLines={1}
            >
              {name}
            </Text>
            <View className={cn("rounded-md px-2 py-0.5", role.chip)}>
              <Text variant="label" className={cn("font-bold", role.ink)}>
                {userRoleLabel(user.role)}
              </Text>
            </View>
          </View>
          <Text variant="meta" className="mt-0.5 text-muted" numberOfLines={1}>
            {membershipSummary(user)}
          </Text>
          {flags.length > 0 ? (
            <View className="mt-1.5 flex-row flex-wrap gap-1.5">
              {flags.map((flag) => (
                <View
                  key={flag.label}
                  className={cn("rounded-md px-1.5 py-0.5", FLAG_STYLE[flag.tone].chip)}
                >
                  <Text variant="label" className={FLAG_STYLE[flag.tone].ink}>
                    {flag.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : open ? (
          <ChevronUp color={colors.primary} size={20} />
        ) : (
          <ChevronDown color={colors.muted} size={20} />
        )}
      </View>

      {open ? (
        <Animated.View
          entering={disclosureEnter(!!reduceMotion)}
          className="mt-3.5 gap-3 border-t border-line/60 pt-3.5"
        >
          <Text variant="meta" className="text-ink-soft" selectable>
            {user.email}
          </Text>

          {user.organizations.length > 0 || user.pendingInvitations.length > 0 ? (
            <View className="gap-1.5">
              {user.organizations.map((organization) => (
                <View key={organization.id} className="flex-row items-center gap-2">
                  <Building2 color={colors.muted} size={14} />
                  <Text variant="label" className="min-w-0 flex-1 text-ink-soft">
                    {organization.name}
                  </Text>
                  {own ? null : (
                    <TactilePressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove from ${organization.name}`}
                      onPress={() =>
                        Alert.alert(
                          `Remove ${name} from ${organization.name}?`,
                          "They lose access to that organization's conversations.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Remove",
                              style: "destructive",
                              onPress: () =>
                                actions.removeFromOrganization(user, organization.id),
                            },
                          ],
                        )
                      }
                      className="size-8 items-center justify-center rounded-full"
                    >
                      <Trash2 color={colors.muted} size={14} />
                    </TactilePressable>
                  )}
                </View>
              ))}
              {user.pendingInvitations.map((invitation) => (
                <View key={invitation.id} className="flex-row items-center gap-2">
                  <MailPlus color={colors.amber} size={14} />
                  <Text variant="label" className="min-w-0 flex-1 text-muted">
                    {invitation.organization.name} · invited
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {invitable.length > 0 ? (
            <View className="gap-1.5">
              <Text variant="label" className="uppercase tracking-wide text-muted">
                {joinsOnInvite ? "Add to" : "Invite to"}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {invitable.map((organization) => (
                  <TactilePressable
                    key={organization.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${joinsOnInvite ? "Add to" : "Invite to"} ${organization.name}`}
                    onPress={() => actions.invite(user, [organization.id])}
                    className="min-h-9 flex-row items-center gap-1.5 justify-center rounded-full border border-line/80 bg-line/35 px-3"
                  >
                    <MailPlus color={colors.ink} size={14} />
                    <Text variant="label" className="text-ink">
                      {organization.name}
                    </Text>
                  </TactilePressable>
                ))}
              </View>
            </View>
          ) : null}

          {own ? (
            <Text variant="label" className="text-muted">
              This is your own account. Role, ban and deletion are managed from
              another Admin&#8217;s session.
            </Text>
          ) : (
            <>
              <View className="gap-1.5">
                <Text variant="label" className="uppercase tracking-wide text-muted">
                  Change role
                </Text>
                <View className="flex-row gap-2">
                  {otherRoles(user.role).map((next) => (
                    <TactilePressable
                      key={next}
                      accessibilityRole="button"
                      accessibilityLabel={`Make ${userRoleLabel(next)}`}
                      onPress={() =>
                        Alert.alert(
                          `Make ${name} an ${userRoleLabel(next).toLowerCase()}?`,
                          next === "agent"
                            ? "They gain every agent capability."
                            : next === "admin"
                              ? "Admins can see and manage everything."
                              : "They lose every staff capability.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: userRoleLabel(next),
                              onPress: () => actions.changeRole(user, next),
                            },
                          ],
                        )
                      }
                      className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-line/80 bg-line/35 px-3"
                    >
                      <UserCog color={colors.ink} size={15} />
                      <Text variant="label" className="text-ink">
                        {userRoleLabel(next)}
                      </Text>
                    </TactilePressable>
                  ))}
                </View>
              </View>

              <View className="flex-row gap-2">
                <ActionButton
                  label="Sign out"
                  icon={LogOut}
                  onPress={confirmRevoke}
                />
                <ActionButton
                  label="Reset 2FA"
                  icon={ShieldCheck}
                  onPress={confirmTwoFactor}
                />
              </View>

              {settingPassword ? (
                <View className="gap-2">
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    placeholder="New password…"
                    accessibilityLabel="New password"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    textContentType="newPassword"
                    className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
                  />
                  <View className="flex-row gap-2">
                    <ActionButton
                      label="Cancel"
                      icon={KeyRound}
                      onPress={() => {
                        setPassword("");
                        setSettingPassword(false);
                      }}
                    />
                    <ActionButton
                      label="Set password"
                      icon={KeyRound}
                      onPress={submitPassword}
                    />
                  </View>
                  <Text variant="label" className="text-muted">
                    They are signed out everywhere when it changes.
                  </Text>
                </View>
              ) : (
                <View className="flex-row gap-2">
                  <ActionButton
                    label="Set password"
                    icon={KeyRound}
                    onPress={() => setSettingPassword(true)}
                  />
                  <ActionButton
                    label={user.isBanned ? "Lift ban" : "Ban"}
                    icon={Ban}
                    tone={user.isBanned ? "neutral" : "danger"}
                    onPress={
                      user.isBanned ? () => actions.unban(user) : confirmBan
                    }
                  />
                </View>
              )}

              <ActionButton
                label="Delete account"
                icon={Trash2}
                tone="danger"
                onPress={confirmDelete}
              />
            </>
          )}

          {problem ? (
            <Text
              accessibilityLiveRegion="polite"
              variant="label"
              className="text-danger"
            >
              {problem}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}
    </TactilePressable>
  );
});
