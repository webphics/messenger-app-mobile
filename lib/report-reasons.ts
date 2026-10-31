/**
 * Why somebody is reporting a Post, a Message or a group, and what the person
 * reporting is told about each reason.
 *
 * Mirrors the API's `reportReasons` (`docs/api/reports.md` in messenger-api).
 * The order is the order the sheet lists them in: the reasons App Review names
 * first, intimate images shared without consent near the top because it is the
 * one a person most needs to find without reading every row, and `other` last.
 */

export const REPORT_REASONS = [
  'harassment',
  'nonconsensual_intimate_imagery',
  'hate',
  'sexual_content',
  'violence',
  'self_harm',
  'spam',
  'illegal',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

export type ReportTargetKind = 'wall_post' | 'message' | 'group'

/** The API's ceiling on the optional note a person adds to a report. */
export const REPORT_DETAILS_MAX = 1000

export const REPORT_REASON_COPY: Record<ReportReason, { label: string; hint: string }> = {
  harassment: {
    label: 'Harassment or bullying',
    hint: 'Threats, insults or targeting someone.',
  },
  nonconsensual_intimate_imagery: {
    label: 'Intimate images shared without consent',
    hint: 'Including images that are AI-generated, edited or faked to look like a real person.',
  },
  hate: {
    label: 'Hate',
    hint: 'Attacks on people for who they are.',
  },
  sexual_content: {
    label: 'Sexual or explicit content',
    hint: 'Nudity, pornography or sexual messages.',
  },
  violence: {
    label: 'Violence or threats',
    hint: 'Graphic violence, or promoting it.',
  },
  self_harm: {
    label: 'Self-harm',
    hint: 'Encouraging suicide or self-harm.',
  },
  spam: {
    label: 'Spam or scam',
    hint: 'Unwanted ads, scams or fake links.',
  },
  illegal: {
    label: 'Something illegal',
    hint: 'Selling illegal goods, or other unlawful content.',
  },
  other: {
    label: 'Something else',
    hint: 'Tell us what is wrong in the note below.',
  },
}

/** What the sheet's title calls the thing being reported. */
export function reportTargetNoun(kind: ReportTargetKind): string {
  if (kind === 'wall_post') return 'post'
  if (kind === 'message') return 'message'
  return 'group'
}

/**
 * The note as it will be sent, or the sentence that says why it cannot be.
 *
 * Trimmed, and absent rather than empty: the API treats a missing note and a
 * blank one alike, and only one of them is worth putting on the wire. `other`
 * says nothing on its own, so it is the one reason that needs the note.
 */
export function reportDetailsVerdict(
  reason: ReportReason | null,
  details: string,
): { ok: true; details: string | undefined } | { ok: false; message: string } {
  if (!reason) return { ok: false, message: 'Choose a reason.' }
  const trimmed = details.trim()
  if (trimmed.length > REPORT_DETAILS_MAX) {
    return { ok: false, message: `Keep the note under ${REPORT_DETAILS_MAX} characters.` }
  }
  if (reason === 'other' && trimmed === '') {
    return { ok: false, message: 'Tell us what is wrong.' }
  }
  return { ok: true, details: trimmed === '' ? undefined : trimmed }
}
