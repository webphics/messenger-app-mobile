import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { UserPlus, X } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { failureNotice } from "@/lib/conversation-failure";
import { emailLooksValid } from "@/lib/email";
import { colors, screenBottomPad, screenTopPad } from "@/lib/tokens";
import { createUser } from "@/lib/user-api";
import { userRoleLabel } from "@/lib/user-directory";
import type { ManagedUser, OrganizationSummary, UserRole } from "@/lib/types";

/**
 * Creating an account.
 *
 * What the API insists on: an email, a role, and, for staff, at least one
 * organization, so nobody on the company's side is created into a vacuum. A
 * customer may have none: they start in General Support. Every organization
 * becomes an *invitation* rather than a membership; a customer's arrives as a
 * card in their General Support. What it does
 * not insist on is a password: an account created without one is reached by
 * magic link, which is how a Customer account comes into existence
 * everywhere else here, so the field says so rather than being required.
 */

const ROLES: readonly UserRole[] = ["customer", "agent", "admin"];

type NewUserSheetProps = {
  visible: boolean;
  onClose: () => void;
  organizations: OrganizationSummary[];
  /** Handed the created account, so the directory can show it without refetching. */
  onCreated: (user: ManagedUser) => void;
};

export function NewUserSheet({
  visible,
  onClose,
  organizations,
  onCreated,
}: NewUserSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own window, so its own inset provider — see NewChatModal. */}
      <SafeAreaProvider>
        <UserForm
          onClose={onClose}
          organizations={organizations}
          onCreated={onCreated}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

function UserForm({
  onClose,
  organizations,
  onCreated,
}: Omit<NewUserSheetProps, "visible">) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("customer");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const submit = useCallback(() => {
    const address = email.trim();
    if (!emailLooksValid(address)) {
      setProblem("Enter an email address.");
      return;
    }
    // Staff are invited to at least one; a customer may start in none, in General Support,
    // and is invited from there.
    if (picked.length === 0 && role !== "customer") {
      setProblem("Pick at least one organization to invite them to.");
      return;
    }

    setBusy(true);
    setProblem(null);
    void createUser({ name, email: address, role, organizationIds: picked }).then(
      (result) => {
        setBusy(false);
        if (!result.ok) {
          setProblem(failureNotice(result.failure, "Could not create the account").hint);
          return;
        }
        onCreated(result.value);
        onClose();
      },
    );
  }, [email, name, onClose, onCreated, picked, role]);

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="flex-row items-center justify-between border-b border-line/60 bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <UserPlus color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            New account
          </Text>
        </View>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onClose}
          className="size-9 items-center justify-center rounded-full bg-line/80"
        >
          <X color={colors.inkSoft} size={18} />
        </TactilePressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Email
          </Text>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            accessibilityLabel="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="emailAddress"
            className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
          />
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Name — optional
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Their name…"
            accessibilityLabel="Name"
            className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
          />
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Role
          </Text>
          <View className="flex-row gap-2">
            {ROLES.map((option) => {
              const selected = option === role;
              return (
                <TactilePressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={userRoleLabel(option)}
                  accessibilityState={{ selected }}
                  onPress={() => setRole(option)}
                  className={cn(
                    "min-h-11 flex-1 justify-center rounded-2xl border px-3",
                    selected
                      ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                      : "border-line/80 bg-line/35",
                  )}
                >
                  <Text
                    variant="label"
                    className={cn(
                      "text-center",
                      selected ? "text-primary-foreground" : "text-ink-soft",
                    )}
                  >
                    {userRoleLabel(option)}
                  </Text>
                </TactilePressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Invite to
          </Text>
          {organizations.length === 0 ? (
            <Text variant="meta" className="text-muted">
              There are no organizations yet. A customer can still be created —
              they start in General Support — but staff need one to join.
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {organizations.map((organization) => {
                const selected = picked.includes(organization.id);
                return (
                  <TactilePressable
                    key={organization.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={organization.name}
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggle(organization.id)}
                    className={cn(
                      "min-h-11 justify-center rounded-full border px-3.5",
                      selected
                        ? "border-transparent bg-primary shadow-sm shadow-primary/25"
                        : "border-line/80 bg-line/35",
                    )}
                  >
                    <Text
                      variant="label"
                      className={selected ? "text-primary-foreground" : "text-ink-soft"}
                    >
                      {organization.name}
                    </Text>
                  </TactilePressable>
                );
              })}
            </View>
          )}
          <Text variant="label" className="font-normal text-muted">
            They are invited, not added. Membership begins when they accept.
          </Text>
        </View>
      </ScrollView>

      <View
        className="border-t border-line/60 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
      >
        {problem ? (
          <Text
            accessibilityLiveRegion="polite"
            variant="meta"
            className="mb-2 text-danger"
          >
            {problem}
          </Text>
        ) : null}
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Create account"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={submit}
          className={cn(
            "min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary",
            busy && "opacity-70",
          )}
        >
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : null}
          <Text variant="label" className="font-semibold text-primary-foreground">
            Create account
          </Text>
        </TactilePressable>
      </View>
    </View>
  );
}
