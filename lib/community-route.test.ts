import { communityHref, communityIdFromRoute } from '@/lib/community-route'

describe('communityHref', () => {
  it('carries the id in params, which native Expo Router needs', () => {
    expect(communityHref('community-1')).toEqual({
      pathname: '/community/[id]',
      params: { id: 'community-1' },
    })
  })
})

describe('communityIdFromRoute', () => {
  it('reads the id off the params where there are any', () => {
    expect(communityIdFromRoute('community-1', '/community/community-1')).toBe('community-1')
  })

  it('falls back to the pathname, which is what survives a reload', () => {
    expect(communityIdFromRoute(undefined, '/community/community-1')).toBe('community-1')
  })

  it('takes the first of a repeated param rather than the array', () => {
    expect(communityIdFromRoute(['a', 'b'], '/community/a')).toBe('a')
  })

  it('reads an encoded segment back', () => {
    expect(communityIdFromRoute(undefined, '/community/a%2Fb')).toBe('a/b')
  })

  it.each([
    ['the literal segment', '[id]', '/community/[id]'],
    ['another route entirely', undefined, '/chat/conversation-1'],
    ['the route with nothing on it', undefined, '/community'],
  ])('answers nothing for %s', (_name, raw, pathname) => {
    expect(communityIdFromRoute(raw, pathname)).toBeUndefined()
  })
})
