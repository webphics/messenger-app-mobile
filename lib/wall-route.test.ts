import { sharedWallHref, sharedWallIdFromRoute, wallSavedHref } from '@/lib/wall-route'

describe('sharedWallHref', () => {
  it('carries the id in params, which native Expo Router needs', () => {
    expect(sharedWallHref('wall-1')).toEqual({
      pathname: '/wall/[id]',
      params: { id: 'wall-1' },
    })
  })
})

describe('wallSavedHref', () => {
  it('names the one Saved view, which carries no id of its own', () => {
    expect(wallSavedHref()).toBe('/wall/saved')
  })
})

describe('sharedWallIdFromRoute', () => {
  it('reads the id off the params where there are any', () => {
    expect(sharedWallIdFromRoute('wall-1', '/wall/wall-1')).toBe('wall-1')
  })

  it('falls back to the pathname, which is what survives a reload', () => {
    expect(sharedWallIdFromRoute(undefined, '/wall/wall-1')).toBe('wall-1')
  })

  it('takes the first of a repeated param rather than the array', () => {
    expect(sharedWallIdFromRoute(['a', 'b'], '/wall/a')).toBe('a')
  })

  it('reads an encoded segment back', () => {
    expect(sharedWallIdFromRoute(undefined, '/wall/a%2Fb')).toBe('a/b')
  })

  it.each([
    ['the literal segment', '[id]', '/wall/[id]'],
    ['another route entirely', undefined, '/chat/conversation-1'],
    ['the route with nothing on it', undefined, '/wall'],
  ])('answers nothing for %s', (_name, raw, pathname) => {
    expect(sharedWallIdFromRoute(raw, pathname)).toBeUndefined()
  })
})
