import { Building2, ChevronRight, Headphones, MessageCircle } from "@/components/icons";
import { memo, useCallback } from "react";
import { ActivityIndicator, View } from "react-native";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TactilePressable } from "@/components/ui/tactile-pressable";
import { Text } from "@/components/ui/text";
import {
  contactRowLabel,
  contactSubtitle,
  type ContactIntent,
  type ContactPick,
} from "@/lib/contact-directory";
import { initials } from "@/lib/display";
import { colors } from "@/lib/tokens";
import type { Contact } from "@/lib/types";

/**
 * One name in the contact directory.
 *
 * Shared by the People tab and the compose sheet, because they are the same
 * row: `lib/contact-directory` decides what a tap means and this only wears
 * the answer. A row with a thread behind it opens it, one without starts one,
 * one with several organizations to choose between opens the choice inline
 * (for an Admin messaging a Customer, always, with General Support offered too),
 * and one a tap cannot act on is disabled with the reason on it rather than
 * failing after a round trip.
 */

type ContactRowProps = {
  contact: Contact;
  intent: ContactIntent;
  onPress: (contact: Contact) => void;
  /** Chosen from the organizations, or General Support, this row expanded to offer. */
  onPickOrganization: (contact: Contact, pick: ContactPick) => void;
  /** Set while this row's request is out, so a second tap cannot start a second one. */
  busy: boolean;
  /** Whether this row is showing the organizations to choose between. */
  expanded: boolean;
  /** What the API said when this row's request was refused. */
  refusal: string | null;
};

/** The accent a kind wears, so staff, customers and companies read apart at a glance. */
function tint(contact: Contact): { badge: string; text: string } {
  if (contact.kind === "company") return { badge: "bg-line/70", text: "text-ink-soft" };
  if (contact.role === "admin") return { badge: "bg-primary-soft", text: "text-primary" };
  if (contact.role === "agent") return { badge: "bg-amber/15", text: "text-amber" };
  return { badge: "bg-success/15", text: "text-success" };
}

export const ContactRow = memo(function ContactRow({
  contact,
  intent,
  onPress,
  onPickOrganization,
  busy,
  expanded,
  refusal,
}: ContactRowProps) {
  const disabled = intent.kind === "unavailable" || busy;
  const accent = tint(contact);
  const subtitle = contactSubtitle(contact, intent);

  const handlePress = useCallback(() => {
    onPress(contact);
  }, [contact, onPress]);

  // No entrance: a FlatList mounts this row on every scroll into the window.
  return (
    <View>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={contactRowLabel(contact, intent)}
        accessibilityState={
          intent.kind === "choose" ? { disabled, expanded } : { disabled }
        }
        disabled={disabled}
        onPress={handlePress}
        className={`flex-row items-center gap-3.5 rounded-2xl border border-line/70 bg-surface p-3.5 shadow-md shadow-black/8 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <Avatar alt={contact.name} className="size-11">
          <AvatarFallback className={accent.badge}>
            {contact.kind === "company" ? (
              <Building2 color={colors.inkSoft} size={18} />
            ) : (
              <Text variant="meta" className={`font-bold ${accent.text}`}>
                {initials(contact.name)}
              </Text>
            )}
          </AvatarFallback>
        </Avatar>

        <View className="min-w-0 flex-1">
          <Text variant="title" className="text-ink" numberOfLines={1}>
            {contact.name}
          </Text>
          <Text
            variant="label"
            className="mt-0.5 font-normal text-muted"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>

        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : intent.kind === "open" ? (
          /*
            Two different affordances, because they are two different acts: a
            chevron for a thread that already exists and is being walked into,
            a compose glyph for one this tap will bring into being.
          */
          <ChevronRight color={colors.muted} size={18} />
        ) : intent.kind === "unavailable" ? null : (
          <MessageCircle color={colors.primary} size={18} />
        )}
      </TactilePressable>

      {refusal ? (
        <View
          accessibilityLiveRegion="polite"
          className="mt-1.5 rounded-2xl border border-danger/30 bg-danger/10 px-3.5 py-2.5"
        >
          <Text variant="meta" className="text-ink-soft">
            {refusal}
          </Text>
        </View>
      ) : null}

      {expanded && intent.kind === "choose" ? (
        <View accessibilityLiveRegion="polite" className="mt-1.5 gap-1.5 pl-6">
          <Text variant="label" className="text-muted">
            {intent.generalSupport ? "Which conversation?" : "Which organization?"}
          </Text>
          {intent.generalSupport && intent.organizations.length === 0 ? (
            <Text variant="meta" className="text-muted">
              Not in any organization yet.
            </Text>
          ) : null}
          {intent.organizations.map((organization) => (
            <TactilePressable
              key={organization.id}
              accessibilityRole="button"
              accessibilityLabel={`Start in ${organization.name}`}
              onPress={() =>
                onPickOrganization(contact, { kind: "organization", id: organization.id })
              }
              className="min-h-11 flex-row items-center gap-2.5 rounded-2xl border border-line/70 bg-surface px-3.5"
            >
              <Building2 color={colors.inkSoft} size={16} />
              <Text variant="label" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
                {organization.name}
              </Text>
            </TactilePressable>
          ))}
          {intent.generalSupport ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Start in General Support"
              accessibilityHint="Their conversation with the company as a whole. Only admins see it."
              onPress={() => onPickOrganization(contact, { kind: "general-support" })}
              className="min-h-11 flex-row items-center gap-2.5 rounded-2xl border border-primary/25 bg-primary-soft/60 px-3.5 py-2"
            >
              <Headphones color={colors.primary} size={16} />
              <View className="min-w-0 flex-1">
                <Text variant="label" className="text-ink">
                  General Support
                </Text>
                <Text variant="meta" className="text-muted">
                  Only admins see it
                </Text>
              </View>
            </TactilePressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
