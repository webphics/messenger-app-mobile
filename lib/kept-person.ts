import { parseSessionUser } from "@/lib/auth-response";
import type { SessionUser } from "@/lib/types";

/**
 * The signed-in person as something that can be put down beside the Session
 * cookie and picked up again next launch.
 *
 * Pure, and separate from `lib/keychain` for the same reason `lib/store-rows` is
 * separate from `lib/conversation-store`: what a kept person *is* can be table
 * tested, and where it is kept is a native module that cannot be.
 *
 * Reading is deliberately the same parse the API's own session payload goes
 * through. What comes back off the keystore is a record of unknown shape — an
 * older build's, a truncated write, something else entirely — and it earns no
 * more trust than the network does. A shape this build does not recognise reads
 * as nobody kept, which is the same answer as an empty keystore and lands on the
 * Unreachable screen rather than signing anybody in as half a person.
 */

/**
 * The four identity fields and the assignment switch, and nothing incidental
 * that happens to be on the object.
 *
 * The switch is the one field here that is not about who somebody is. It is
 * kept because it decides the shape of every staff screen — whether there is
 * an Unassigned tab, whether a thread offers Engage — and a cold start with no
 * signal should draw the app this person last saw rather than the other one,
 * until the API confirms which it is.
 */
export function serialiseKeptPerson(user: SessionUser): string {
  const { id, name, email, role, supportAssignmentEnabled, termsAcceptedAt } = user;
  return JSON.stringify({ id, name, email, role, supportAssignmentEnabled, termsAcceptedAt });
}

/** The kept person, or null when there is none and when what is there is not one. */
export function parseKeptPerson(raw: string | null): SessionUser | null {
  if (!raw) return null;

  try {
    const record: unknown = JSON.parse(raw);
    const person = parseSessionUser(record);
    // A person kept by a build from before the terms step carries no answer
    // either way. Unknown rather than "never agreed": an offline cold start must
    // not stop them at a screen whose only button needs the network, and the
    // first reachable session read brings the API's answer.
    if (person && typeof record === "object" && record !== null && !("termsAcceptedAt" in record)) {
      const { termsAcceptedAt: _unknown, ...kept } = person;
      return kept;
    }
    return person;
  } catch {
    // Not JSON at all. Same answer as a shape that parsed and was not a person.
    return null;
  }
}
