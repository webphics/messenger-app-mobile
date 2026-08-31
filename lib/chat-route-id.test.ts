import { chatHref, chatIdFromRoute, chatIdFromSegments } from '@/lib/chat-route-id'

describe('chatIdFromRoute', () => {
  test('prefers search params', () => {
    expect(chatIdFromRoute('offers', '/chat/ignored')).toBe('offers')
    expect(chatIdFromRoute(['conv-assigned'], '/chat/x')).toBe('conv-assigned')
  })

  test('falls back to pathname after reload when params are empty', () => {
    expect(chatIdFromRoute(undefined, '/chat/conv-assigned')).toBe('conv-assigned')
    expect(chatIdFromRoute(undefined, '/chat/offers')).toBe('offers')
  })

  test('undefined when not on a chat route', () => {
    expect(chatIdFromRoute(undefined, '/(customer)')).toBeUndefined()
    expect(chatIdFromRoute(undefined, '/chat')).toBeUndefined()
    expect(chatIdFromRoute(undefined, '/chat/[id]')).toBeUndefined()
  })
})

describe('chatIdFromSegments', () => {
  test('reads the segment after chat', () => {
    expect(chatIdFromSegments(['chat', 'conv-assigned'])).toBe('conv-assigned')
    expect(chatIdFromSegments(['(customer)', 'chat', 'offers'])).toBe('offers')
  })

  test('ignores placeholder segment', () => {
    expect(chatIdFromSegments(['chat', '[id]'])).toBeUndefined()
    expect(chatIdFromSegments(['(customer)'])).toBeUndefined()
  })
})

describe('chatHref', () => {
  test('typed dynamic href so native fills params.id', () => {
    expect(chatHref('offers')).toEqual({ pathname: '/chat/[id]', params: { id: 'offers' } })
    expect(chatHref('conv-assigned')).toEqual({
      pathname: '/chat/[id]',
      params: { id: 'conv-assigned' },
    })
  })
})
