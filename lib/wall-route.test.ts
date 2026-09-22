import {
  sharedWallHref,
  sharedWallIdFromRoute,
  wallPostHref,
  wallPostIdFromRoute,
  wallSavedHref,
} from '@/lib/wall-route'

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

describe('a Post permalink', () => {
  it('names the route and carries the id', () => {
    expect(wallPostHref('p1')).toEqual({ pathname: '/wall/post/[id]', params: { id: 'p1' } })
  })

  it('prefers the param it was given', () => {
    expect(wallPostIdFromRoute('p1', '/wall/post/p2')).toBe('p1')
  })

  it('falls back to the pathname when params come back empty after a reload', () => {
    expect(wallPostIdFromRoute(undefined, '/wall/post/p2')).toBe('p2')
    expect(wallPostIdFromRoute('[id]', '/wall/post/p2')).toBe('p2')
  })

  it('decodes an id that travelled encoded', () => {
    expect(wallPostIdFromRoute(undefined, '/wall/post/a%2Fb')).toBe('a/b')
  })

  it('finds nothing on a route that is not a Post', () => {
    expect(wallPostIdFromRoute(undefined, '/wall/saved')).toBeUndefined()
    expect(wallPostIdFromRoute(undefined, '/wall/w1')).toBeUndefined()
    expect(wallPostIdFromRoute(undefined, '/wall/post')).toBeUndefined()
  })

  /**
   * The two live under one prefix, so the named-Wall reader has to refuse the
   * static segments beside it — otherwise `/wall/post/<id>` resolves to the
   * named Wall `post` the moment params are empty.
   */
  it('is not mistaken for a named Wall by the reader beside it', () => {
    expect(sharedWallIdFromRoute(undefined, '/wall/post/p2')).toBeUndefined()
    expect(sharedWallIdFromRoute(undefined, '/wall/saved')).toBeUndefined()
    expect(sharedWallIdFromRoute(undefined, '/wall/w1')).toBe('w1')
  })
})
