import { dynamicRouteId, pushRouteHref } from '@/lib/hub-routes'

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

  test('a report opens the Admin’s review queue, and anybody else’s own inbox', () => {
    expect(pushRouteHref({ screen: 'reports' }, 'admin')).toBe('/(admin)/(home)/reports')
    expect(pushRouteHref({ screen: 'reports' }, 'agent')).toBe('/(agent)/conversations')
  })
})
