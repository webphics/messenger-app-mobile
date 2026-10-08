import {
  chatHref,
  chatIdFromRoute,
  chatDetailsIdFromRoute,
  chatMediaIdFromRoute,
} from '@/lib/chat-route-id'

describe('chatIdFromRoute', () => {
  test('falls back to pathname after reload when params are empty', () => {
    expect(chatIdFromRoute(undefined, '/chat/conv-assigned')).toBe('conv-assigned')
  })

  test('undefined when not on a chat route', () => {
    expect(chatIdFromRoute(undefined, '/chat')).toBeUndefined()
    expect(chatIdFromRoute(undefined, '/chat/[id]')).toBeUndefined()
  })
})

test('the two sections do not read each other’s routes', () => {
  expect(chatDetailsIdFromRoute(undefined, '/chat/media/conv-a')).toBeUndefined()
  expect(chatMediaIdFromRoute(undefined, '/chat/details/conv-a')).toBeUndefined()
})

test('chatHref omits the param rather than carrying an empty Post', () => {
  expect(chatHref('conv-assigned', '')).toEqual({
    pathname: '/chat/[id]',
    params: { id: 'conv-assigned' },
  })
})

test('chatHref carries the Post a Reply to a Post opens the thread with', () => {
  expect(chatHref('conv-assigned', 'post-1')).toEqual({
    pathname: '/chat/[id]',
    params: { id: 'conv-assigned', post: 'post-1' },
  })
})
