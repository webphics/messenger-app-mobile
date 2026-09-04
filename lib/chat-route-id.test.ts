import {
  chatHref,
  chatIdFromRoute,
  chatIdFromSegments,
  chatDetailsHref,
  chatDetailsIdFromRoute,
  chatMediaHref,
  chatMediaIdFromRoute,
} from '@/lib/chat-route-id'

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

describe('chatMediaHref', () => {
  test('typed dynamic href so native fills params.id', () => {
    expect(chatMediaHref('conv-assigned')).toEqual({
      pathname: '/chat/media/[id]',
      params: { id: 'conv-assigned' },
    })
  })
})

describe('chatMediaIdFromRoute', () => {
  test('prefers search params', () => {
    expect(chatMediaIdFromRoute('conv-assigned', '/chat/media/ignored')).toBe(
      'conv-assigned',
    )
    expect(chatMediaIdFromRoute(['conv-a'], '/chat/media/x')).toBe('conv-a')
  })

  test('falls back to the pathname, not to the word media', () => {
    expect(chatMediaIdFromRoute(undefined, '/chat/media/conv-assigned')).toBe(
      'conv-assigned',
    )
    expect(chatMediaIdFromRoute(undefined, '/chat/media')).toBeUndefined()
    expect(chatMediaIdFromRoute(undefined, '/chat/media/[id]')).toBeUndefined()
  })

  test('undefined off the media route', () => {
    expect(chatMediaIdFromRoute(undefined, '/chat/conv-assigned')).toBeUndefined()
    expect(chatMediaIdFromRoute(undefined, '/(customer)')).toBeUndefined()
  })
})

describe('chatDetailsHref', () => {
  test('typed dynamic href so native fills params.id', () => {
    expect(chatDetailsHref('conv-assigned')).toEqual({
      pathname: '/chat/details/[id]',
      params: { id: 'conv-assigned' },
    })
  })
})

describe('chatDetailsIdFromRoute', () => {
  test('prefers search params', () => {
    expect(chatDetailsIdFromRoute('conv-assigned', '/chat/details/ignored')).toBe(
      'conv-assigned',
    )
    expect(chatDetailsIdFromRoute(['conv-a'], '/chat/details/x')).toBe('conv-a')
  })

  test('falls back to the pathname, not to the word details', () => {
    expect(chatDetailsIdFromRoute(undefined, '/chat/details/conv-assigned')).toBe(
      'conv-assigned',
    )
    expect(chatDetailsIdFromRoute(undefined, '/chat/details')).toBeUndefined()
    expect(chatDetailsIdFromRoute(undefined, '/chat/details/[id]')).toBeUndefined()
  })

  test('the two sections do not read each other’s routes', () => {
    expect(chatDetailsIdFromRoute(undefined, '/chat/media/conv-a')).toBeUndefined()
    expect(chatMediaIdFromRoute(undefined, '/chat/details/conv-a')).toBeUndefined()
  })
})
