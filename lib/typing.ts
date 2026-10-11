import type { Typist } from '@/lib/realtime-events'

/**
 * What the typing bubble says, and when a keystroke is worth telling the server
 * about. Pure, so both are table-tested; the socket and the bubble live in
 * `realtime-context` and `components/chat/typing-indicator`.
 */

/**
 * Shortest gap between two `typing.start` emissions. Keystrokes are throttled
 * to this rather than driven by a timer, so continued typing is its own
 * heartbeat and a pause simply lets the server's five-second expiry take the
 * bubble down. The same number the web client uses.
 */
export const TYPING_HEARTBEAT_MS = 2_000

/**
 * Whether a keystroke at `now` should go out as a `typing.start`. `lastSentAt`
 * is zero when nothing has been sent since the last stop.
 */
export function shouldSendTypingStart(lastSentAt: number, now: number): boolean {
  return lastSentAt === 0 || now - lastSentAt >= TYPING_HEARTBEAT_MS
}

/**
 * Each typist once. A Customer sees every staff member as the same company
 * persona, so two staff typing at once can arrive as two entries with one id,
 * which would read "Acme and Acme are typing".
 */
export function distinctTypists(typists: Typist[]): Typist[] {
  const seen = new Set<string>()
  return typists.filter((typist) => {
    if (seen.has(typist.id)) return false
    seen.add(typist.id)
    return true
  })
}

/**
 * The words beside the dots, or null for the dots alone.
 *
 * A one-to-one conversation gets no words: naming the only other person in the
 * room tells the reader nothing. A Group names who, since there it is the whole
 * question.
 */
export function typingLabel(typists: Typist[], isGroup: boolean): string | null {
  const distinct = distinctTypists(typists)
  if (distinct.length === 0 || !isGroup) return null
  if (distinct.length === 1) return `${distinct[0].name} is typing`
  if (distinct.length === 2) return `${distinct[0].name} and ${distinct[1].name} are typing`
  return `${distinct[0].name} and ${distinct.length - 1} others are typing`
}

/** Typists compared by content, so a repeated payload does not re-render the thread. */
export function sameTypists(a: Typist[], b: Typist[]): boolean {
  if (a.length !== b.length) return false
  return a.every((typist, index) => typist.id === b[index].id && typist.name === b[index].name)
}
