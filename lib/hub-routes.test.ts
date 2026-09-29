import { dynamicRouteId } from '@/lib/hub-routes'

describe('hub-routes', () => {
  test('dynamicRouteId prefers params then path', () => {
    expect(dynamicRouteId('kb-reset', '/article/[id]', 'article')).toBe('kb-reset')
    expect(dynamicRouteId(undefined, '/(agent)/article/kb-reset', 'article')).toBe(
      'kb-reset',
    )
    expect(dynamicRouteId('[id]', '/(admin)/(home)/chart/open-threads', 'chart')).toBe(
      'open-threads',
    )
  })
})
