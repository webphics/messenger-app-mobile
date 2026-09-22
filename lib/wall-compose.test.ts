import {
  hasWallComposeError,
  wallComposeDefaultOrganization,
  wallComposeErrors,
  wallComposeHasImage,
  wallComposeNeedsOrganizationChoice,
  type WallComposeInput,
} from '@/lib/wall-compose'

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

describe('whether an image is attached', () => {
  it('is true with an image among other kinds', () => {
    expect(wallComposeHasImage(['document', 'image', 'video'])).toBe(true)
  })

  it('is false with video or documents alone', () => {
    expect(wallComposeHasImage(['video', 'document'])).toBe(false)
  })

  it('is false with nothing staged', () => {
    expect(wallComposeHasImage([])).toBe(false)
  })
})

describe('what a submit is wrong about', () => {
  it('is nothing, for a valid submit', () => {
    const errors = wallComposeErrors(input())
    expect(errors).toEqual({
      organization: null,
      attachment: null,
      link: null,
      title: null,
      endsAt: null,
    })
    expect(hasWallComposeError(errors)).toBe(false)
  })

  it('names the missing organization', () => {
    const errors = wallComposeErrors(input({ hasOrganization: false }))
    expect(errors.organization).toBe('Choose an organization to post to.')
    expect(hasWallComposeError(errors)).toBe(true)
  })

  it('names the missing image, video and documents included', () => {
    expect(wallComposeErrors(input({ attachmentKinds: [] })).attachment).toBe(
      'Attach at least one image to publish this post.',
    )
    expect(wallComposeErrors(input({ attachmentKinds: ['video', 'document'] })).attachment).toBe(
      'Attach at least one image to publish this post.',
    )
  })

  it('lets video and documents ride along beside an image', () => {
    expect(wallComposeErrors(input({ attachmentKinds: ['image', 'video', 'document'] })).attachment).toBeNull()
  })

  it('refuses a link with only a label', () => {
    expect(wallComposeErrors(input({ linkLabel: 'Docs' })).link).toBe(
      'A link button needs both a label and a URL.',
    )
  })

  it('refuses a link with only a URL', () => {
    expect(wallComposeErrors(input({ linkUrl: 'https://x.test' })).link).toBe(
      'A link button needs both a label and a URL.',
    )
  })

  it('accepts no link at all, and a whole link', () => {
    expect(wallComposeErrors(input()).link).toBeNull()
    expect(wallComposeErrors(input({ linkLabel: 'Docs', linkUrl: 'https://x.test' })).link).toBeNull()
  })

  it('treats whitespace-only halves as absent', () => {
    expect(wallComposeErrors(input({ linkLabel: '   ', linkUrl: '  ' })).link).toBeNull()
  })

  it('reports every wrong field at once', () => {
    const errors = wallComposeErrors(
      input({ hasOrganization: false, attachmentKinds: [], linkLabel: 'Docs' }),
    )
    expect(hasWallComposeError(errors)).toBe(true)
    expect(errors.organization).not.toBeNull()
    expect(errors.attachment).not.toBeNull()
    expect(errors.link).not.toBeNull()
  })
})

describe('whether the organization has to be chosen', () => {
  it('is false for zero or one organization', () => {
    expect(wallComposeNeedsOrganizationChoice(0)).toBe(false)
    expect(wallComposeNeedsOrganizationChoice(1)).toBe(false)
  })

  it('is true for more than one', () => {
    expect(wallComposeNeedsOrganizationChoice(2)).toBe(true)
  })
})

describe('the organization a fresh form starts on', () => {
  it('defaults to the one and only organization', () => {
    expect(wallComposeDefaultOrganization([{ id: 'org-1' }])).toBe('org-1')
  })

  it('infers nothing with more than one organization', () => {
    expect(wallComposeDefaultOrganization([{ id: 'org-1' }, { id: 'org-2' }])).toBeNull()
  })

  it('infers nothing with none at all', () => {
    expect(wallComposeDefaultOrganization([])).toBeNull()
  })
})

describe('a Post that says what it is', () => {
  const now = Date.parse('2026-09-19T00:00:00.000Z')
  const day = 24 * 60 * 60 * 1000

  it('lets a community Post go without a title, because it is a remark', () => {
    expect(wallComposeErrors(input({ kind: 'community', title: '' })).title).toBeNull()
  })

  it.each(['promotion', 'giveaway', 'news', 'ad'] as const)(
    'makes a %s carry a title, which is what it announces',
    kind => {
      expect(wallComposeErrors(input({ kind, title: '' })).title).toBe(
        'This kind of post needs a title.',
      )
      expect(wallComposeErrors(input({ kind, title: 'Half price' })).title).toBeNull()
    },
  )

  it('reads a title of nothing but spaces as no title', () => {
    expect(wallComposeErrors(input({ kind: 'news', title: '   ' })).title).not.toBeNull()
  })

  it('holds the API ceiling on a title', () => {
    expect(wallComposeErrors(input({ kind: 'news', title: 'x'.repeat(80) })).title).toBeNull()
    expect(wallComposeErrors(input({ kind: 'news', title: 'x'.repeat(81) })).title).toBe(
      'A title is at most 80 characters.',
    )
  })

  it.each(['promotion', 'giveaway'] as const)('lets a %s end', kind => {
    expect(
      wallComposeErrors(input({ kind, title: 'Ends soon', endsAt: now + day, now })).endsAt,
    ).toBeNull()
  })

  it.each(['news', 'ad', 'community'] as const)('refuses a deadline on a %s', kind => {
    expect(wallComposeErrors(input({ kind, title: 'Notice', endsAt: now + day, now })).endsAt).toBe(
      'Only a promotion or a giveaway can have an end date.',
    )
  })

  /** The one the API judges on arrival, so a sheet left open is caught here first. */
  it('refuses a deadline that has already passed', () => {
    expect(
      wallComposeErrors(input({ kind: 'promotion', title: 'Sale', endsAt: now - 1, now })).endsAt,
    ).toBe('The end date must be in the future.')
    expect(
      wallComposeErrors(input({ kind: 'promotion', title: 'Sale', endsAt: now, now })).endsAt,
    ).toBe('The end date must be in the future.')
  })

  it('asks for no deadline at all when none was chosen', () => {
    expect(wallComposeErrors(input({ kind: 'promotion', title: 'Sale', endsAt: null })).endsAt).toBeNull()
  })

  it('counts a title and a deadline among the things a submit can be wrong about', () => {
    expect(
      hasWallComposeError(wallComposeErrors(input({ kind: 'news', title: '' }))),
    ).toBe(true)
  })
})
