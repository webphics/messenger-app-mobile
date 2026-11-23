import { parseAdminFeedback, type AdminFeedback } from '@/lib/feedback-parse'
import {
  buildTriageUpdate,
  checkFeedbackDraft,
  emptyFeedbackDraft,
  feedbackAttachmentType,
  feedbackFields,
  feedbackSentSentence,
  feedbackSummaryLine,
  triageDraftFor,
  withFeedbackKind,
  withTriagedEntry,
  MAX_FEEDBACK_UPLOAD_BYTES,
  type FeedbackDraft,
  type FeedbackEnvironment,
} from '@/lib/feedback-rules'

const ENV: FeedbackEnvironment = {
  platform: 'ios',
  appVersion: '1.1.3',
  userAgent: 'ChatRoute/1.1.3 (iPhone; iOS 19.0)',
  locale: 'en-GB',
  width: 390.4,
  height: 844,
}

function bug(patch: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return {
    ...emptyFeedbackDraft('bug_report'),
    category: 'messaging',
    severity: 'medium',
    title: 'Composer freezes',
    description: 'Typing a long message freezes the composer.',
    ...patch,
  }
}

describe('checking a draft', () => {
  test('a complete bug report passes', () => {
    expect(checkFeedbackDraft(bug())).toEqual({ errors: {}, firstError: null })
  })

  test('an empty form names every missing field, first one first', () => {
    const check = checkFeedbackDraft(emptyFeedbackDraft('bug_report'))
    expect(Object.keys(check.errors).sort()).toEqual(['category', 'description', 'severity', 'title'])
    expect(check.firstError).toBe('category')
  })

  test('feedback asks for no severity', () => {
    const draft = { ...bug({ severity: null }), kind: 'feedback' as const, category: 'praise' as const }
    expect(checkFeedbackDraft(draft).errors.severity).toBeUndefined()
  })

  test('a category from the other kind is not a category', () => {
    expect(checkFeedbackDraft(bug({ category: 'praise' })).errors.category).toBeDefined()
  })

  test.each([
    ['ab', 'title'],
    ['x'.repeat(121), 'title'],
  ] as const)('a title of %#: refused', (title, field) => {
    expect(checkFeedbackDraft(bug({ title })).errors[field]).toBeDefined()
  })

  test('the lengths are judged on trimmed text', () => {
    expect(checkFeedbackDraft(bug({ description: '   short     ' })).errors.description).toBeDefined()
  })
})

describe('switching kind', () => {
  test('keeps what was typed and drops a category the new kind does not have', () => {
    const switched = withFeedbackKind(bug(), 'feedback')
    expect(switched).toMatchObject({ kind: 'feedback', category: null, title: 'Composer freezes' })
  })

  test('keeps Other, which both kinds have', () => {
    expect(withFeedbackKind(bug({ category: 'other' }), 'feedback').category).toBe('other')
  })
})

describe('the fields sent', () => {
  test('a bug report carries its own fields as strings, and the environment', () => {
    const fields = feedbackFields(
      bug({ stepsToReproduce: '  1. Open a thread ', rating: 4, allowContact: false }),
      ENV,
    )
    expect(fields).toEqual({
      kind: 'bug_report',
      category: 'messaging',
      title: 'Composer freezes',
      description: 'Typing a long message freezes the composer.',
      severity: 'medium',
      stepsToReproduce: '1. Open a thread',
      allowContact: 'false',
      platform: 'ios',
      appVersion: '1.1.3',
      userAgent: 'ChatRoute/1.1.3 (iPhone; iOS 19.0)',
      locale: 'en-GB',
      viewport: '390x844',
    })
  })

  test('feedback carries a rating and none of a bug report’s fields', () => {
    const draft = { ...bug({ rating: 5, actualBehavior: 'it broke' }), kind: 'feedback' as const, category: 'praise' as const }
    const fields = feedbackFields(draft, ENV)
    expect(fields.rating).toBe('5')
    expect(fields).not.toHaveProperty('severity')
    expect(fields).not.toHaveProperty('actualBehavior')
  })

  test('an unrated piece of feedback sends no rating', () => {
    const draft = { ...bug(), kind: 'feedback' as const, category: 'praise' as const }
    expect(feedbackFields(draft, ENV)).not.toHaveProperty('rating')
  })

  test('a long user agent is cut to the column rather than failing the report', () => {
    const fields = feedbackFields(bug(), { ...ENV, userAgent: 'x'.repeat(600), width: 0 })
    expect(fields.userAgent).toHaveLength(512)
    expect(fields).not.toHaveProperty('viewport')
  })
})

describe('an attachment', () => {
  test.each([
    ['screenshot.png', 1000, 'image/png'],
    ['clip.mov', 1000, 'video/quicktime'],
    ['log.txt', null, 'text/plain'],
  ] as const)('%s goes as %s', (name, size, type) => {
    expect(feedbackAttachmentType({ uri: `file:///c/${name}`, name, size })).toEqual({ ok: true, type: type })
  })

  test.each([
    ['notes.docx', 10],
    ['archive.zip', 10],
    ['voice.m4a', 10],
  ])('%s is refused: the API takes no Office files, archives or audio here', (name, size) => {
    expect(feedbackAttachmentType({ uri: `file:///c/${name}`, name, size }).ok).toBe(false)
  })

  test('anything over 15 MB is refused, naming the file', () => {
    const answer = feedbackAttachmentType({
      uri: 'file:///c/a.mp4',
      name: 'a.mp4',
      size: MAX_FEEDBACK_UPLOAD_BYTES + 1,
    })
    expect(answer).toEqual({ ok: false, reason: '“a.mp4” is larger than 15 MB.' })
  })
})

test('the sentence after sending quotes the reference when there is one', () => {
  expect(feedbackSentSentence('bug_report', 'BUG-3')).toBe('Thanks. Your bug report was sent as BUG-3.')
  expect(feedbackSentSentence('feedback', '')).toBe('Thanks. Your feedback was sent.')
})

const ENTRY = parseAdminFeedback({
  id: 'f-1',
  reference: 'BUG-1',
  kind: 'bug_report',
  status: 'new',
  category: 'messaging',
  severity: 'high',
  title: 'Composer freezes',
  description: 'It freezes.',
  attachments: [],
  platform: 'ios',
  allowContact: true,
  internalNote: 'Seen on 1.1.2 too',
  response: null,
  createdAt: '2026-11-20T10:00:00.000Z',
}) as AdminFeedback

describe('a triage save', () => {
  test('sends nothing when nothing changed', () => {
    expect(buildTriageUpdate(ENTRY, triageDraftFor(ENTRY))).toBeNull()
  })

  test('sends only what changed, and cleared text as null', () => {
    const update = buildTriageUpdate(ENTRY, {
      ...triageDraftFor(ENTRY),
      status: 'in_progress',
      internalNote: '   ',
    })
    expect(update).toEqual({ status: 'in_progress', internalNote: null })
  })

  test('never sends a severity for feedback', () => {
    const feedback = { ...ENTRY, kind: 'feedback' as const, severity: null }
    expect(buildTriageUpdate(feedback, { ...triageDraftFor(feedback), severity: 'low' })).toBeNull()
  })

  test('an entry that closed leaves the Open tab and stays on Closed', () => {
    const resolved = { ...ENTRY, status: 'resolved' as const }
    expect(withTriagedEntry([ENTRY], resolved, 'open')).toEqual([])
    expect(withTriagedEntry([ENTRY], resolved, 'closed')).toEqual([resolved])
  })
})

describe('the Hub row', () => {
  test.each([
    [null, 'Bug reports and feedback from everyone'],
    [{ bugReports: { open: 0, new: 0, critical: 0 }, feedback: { open: 0, new: 0, averageRating: null } }, 'Nothing open'],
    [{ bugReports: { open: 3, new: 1, critical: 0 }, feedback: { open: 2, new: 1, averageRating: 4 } }, '2 new · 5 open'],
    [{ bugReports: { open: 3, new: 0, critical: 1 }, feedback: { open: 0, new: 0, averageRating: null } }, '1 critical · 3 open'],
  ])('%j → %s', (summary, line) => {
    expect(feedbackSummaryLine(summary)).toBe(line)
  })
})
