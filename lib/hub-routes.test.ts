import {
  chartHref,
  dynamicRouteId,
  knowledgeHref,
  knowledgeListHref,
  messagesHref,
  ROLE_HREF,
  SIGN_IN_HREF,
} from '@/lib/hub-routes'

describe('hub-routes', () => {
  test('ROLE_HREF covers all roles', () => {
    expect(ROLE_HREF.customer).toBe('/(customer)')
    expect(ROLE_HREF.agent).toBe('/(agent)')
    expect(ROLE_HREF.admin).toBe('/(admin)')
  })

  test('SIGN_IN_HREF points at the auth group', () => {
    expect(SIGN_IN_HREF).toBe('/(auth)/sign-in')
  })

  test('knowledgeListHref', () => {
    expect(knowledgeListHref('agent')).toBe('/(agent)/knowledge')
    expect(knowledgeListHref('admin')).toBe('/(admin)/knowledge')
  })

  test('knowledgeHref uses article params', () => {
    expect(knowledgeHref('agent', 'kb-reset')).toEqual({
      pathname: '/(agent)/(home)/article/[id]',
      params: { id: 'kb-reset' },
    })
  })

  test('chartHref uses params', () => {
    expect(chartHref('open-threads')).toEqual({
      pathname: '/(admin)/(home)/chart/[id]',
      params: { id: 'open-threads' },
    })
  })

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

describe('messagesHref', () => {
  test.each([
    ['customer', '/(customer)/messages'],
    ['agent', '/(agent)/conversations'],
    ['admin', '/(admin)/conversations'],
  ] as const)('%s reads their inbox at %s', (role, href) => {
    expect(messagesHref(role)).toBe(href)
  })
})
