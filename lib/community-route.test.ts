import { communityIdFromRoute } from '@/lib/community-route'

describe('communityIdFromRoute', () => {
  it('falls back to the pathname, which is what survives a reload', () => {
    expect(communityIdFromRoute(undefined, '/community/community-1')).toBe('community-1')
  })

  it('answers nothing for the literal [id] segment', () => {
    expect(communityIdFromRoute('[id]', '/community/[id]')).toBeUndefined()
  })
})
