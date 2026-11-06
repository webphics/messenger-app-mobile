import { File, Paths } from 'expo-file-system'

import { readRequestRecord } from '@/lib/magic-link-route'

/**
 * When this device last asked the API to mail a sign-in link.
 *
 * Read by the link screen to decide whether a link may be spent without asking
 * (`linkNeedsConfirmation` in `lib/magic-link-route`), written when a request
 * leaves, and removed once a link has been spent, so one request vouches for
 * one link and no more.
 *
 * A timestamp and nothing else. The address is not kept: the link does not say
 * which account it is for, so showing the address that was asked for would be a
 * claim about the link that nothing here can check.
 *
 * Under `Paths.cache`, like the push records in `lib/push-device` and
 * `lib/push-registry`, per ADR-0011: neither platform backs the cache up, so a
 * record cannot ride a backup onto another phone and vouch for a link there.
 *
 * Nothing here throws. A record that cannot be written or read is no record,
 * which costs the person one tap on the confirmation.
 */
export const MAGIC_LINK_REQUESTED_FILE = 'magic-link-requested-at'

function requestFile(): File {
  return new File(Paths.cache, MAGIC_LINK_REQUESTED_FILE)
}

/** Called as a link request (sign-in or sign-up) leaves, before its answer. */
export function rememberMagicLinkRequest(now: number = Date.now()): void {
  try {
    requestFile().write(String(now))
  } catch {
    // No record: the link that arrives asks before it signs in.
  }
}

/** The time of the last request, or null when there is no readable record. */
export function readMagicLinkRequest(): number | null {
  try {
    const file = requestFile()
    if (!file.exists) return null
    return readRequestRecord(file.textSync())
  } catch {
    return null
  }
}

/** Spent: the next link this device opens is confirmed unless it asks again. */
export function forgetMagicLinkRequest(): void {
  try {
    const file = requestFile()
    if (file.exists) file.delete()
  } catch {
    // Left behind, which lets one more link through inside the window at most.
  }
}
