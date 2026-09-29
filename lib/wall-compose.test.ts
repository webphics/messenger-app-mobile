import { wallComposeErrors, type WallComposeInput } from '@/lib/wall-compose'

function input(overrides: Partial<WallComposeInput> = {}): WallComposeInput {
  return {
    hasOrganization: true,
    kind: 'community',
    title: '',
    endsAt: null,
    now: Date.parse('2026-09-19T00:00:00.000Z'),
    attachmentKinds: ['image'],
    linkLabel: '',
    linkUrl: '',
    ...overrides,
  }
}

describe('what a submit is wrong about', () => {
  it('needs an image: video and documents alone do not satisfy it', () => {
    expect(wallComposeErrors(input({ attachmentKinds: ['video', 'document'] })).attachment).not.toBeNull()
  })

  it('refuses a link with only a label', () => {
    expect(wallComposeErrors(input({ linkLabel: 'Docs' })).link).not.toBeNull()
  })

  it('makes a news post carry a title', () => {
    expect(wallComposeErrors(input({ kind: 'news', title: '' })).title).not.toBeNull()
  })

  it('refuses a deadline that has already passed', () => {
    const now = Date.parse('2026-09-19T00:00:00.000Z')
    expect(
      wallComposeErrors(input({ kind: 'promotion', title: 'Sale', endsAt: now, now })).endsAt,
    ).not.toBeNull()
  })
})
