import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_COPY,
  REPORT_REASONS,
  reportDetailsVerdict,
  reportTargetNoun,
} from '@/lib/report-reasons'

describe('report reasons', () => {
  it('offers a reason for intimate images shared without consent, naming AI-generated ones', () => {
    expect(REPORT_REASONS).toContain('nonconsensual_intimate_imagery')
    expect(REPORT_REASON_COPY.nonconsensual_intimate_imagery.hint).toMatch(/AI-generated/)
  })

  it('lists other last', () => {
    expect(REPORT_REASONS.at(-1)).toBe('other')
  })

  it.each([
    ['wall_post', 'post'],
    ['message', 'message'],
    ['group', 'group'],
  ] as const)('calls a %s a %s', (kind, noun) => {
    expect(reportTargetNoun(kind)).toBe(noun)
  })
})

describe('what a report sends as its note', () => {
  it.each([
    ['no reason chosen', null, '', { ok: false, message: 'Choose a reason.' }],
    ['a reason and no note', 'spam', '   ', { ok: true, details: undefined }],
    ['a reason and a note, trimmed', 'hate', '  slur in caption ', { ok: true, details: 'slur in caption' }],
    ['other with no note', 'other', ' ', { ok: false, message: 'Tell us what is wrong.' }],
    ['other with a note', 'other', 'impersonating me', { ok: true, details: 'impersonating me' }],
  ] as const)('%s', (_, reason, details, expected) => {
    expect(reportDetailsVerdict(reason, details)).toEqual(expected)
  })

  it('refuses a note over the API’s ceiling', () => {
    const verdict = reportDetailsVerdict('spam', 'x'.repeat(REPORT_DETAILS_MAX + 1))
    expect(verdict.ok).toBe(false)
  })
})
