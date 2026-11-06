import { communityIdFromRoute } from '@/lib/community-route'

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'

describe('communityIdFromRoute', () => {
  it('falls back to the pathname, which is what survives a reload', () => {
    expect(communityIdFromRoute(undefined, `/community/${ID}`)).toBe(ID)
  })

  it('prefers the search param when there is one', () => {
    expect(communityIdFromRoute(ID, '/somewhere-else')).toBe(ID)
    expect(communityIdFromRoute([ID, 'ignored'], '/somewhere-else')).toBe(ID)
  })

  it('accepts an upper-case UUID, which ParseUUIDPipe also accepts', () => {
    expect(communityIdFromRoute(ID.toUpperCase(), '')).toBe(ID.toUpperCase())
  })

  it('answers nothing for the literal [id] segment', () => {
    expect(communityIdFromRoute('[id]', '/community/[id]')).toBeUndefined()
  })

  it.each([
    ['a slug', 'community-1'],
    ['a path traversal', '../users/me'],
    ['an encoded traversal', '..%2Fusers%2Fme'],
    ['a UUID with a suffix', `${ID}/members/me`],
    ['a UUID with a query', `${ID}?x=1`],
    ['a UUID with a prefix', `x${ID}`],
    ['an empty string', ''],
  ])('refuses %s in the params', (_, raw) => {
    expect(communityIdFromRoute(raw, '')).toBeUndefined()
  })

  it.each([
    ['an encoded traversal', '/community/..%2Fusers%2Fme'],
    ['an encoded suffix', `/community/${ID}%2Fmembers%2Fme`],
    ['a malformed escape', '/community/%E0%A4%A'],
    ['a slug', '/community/community-1'],
  ])('refuses %s in the pathname', (_, pathname) => {
    expect(communityIdFromRoute(undefined, pathname)).toBeUndefined()
  })
})
