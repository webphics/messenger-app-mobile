import { isWebLink } from '@/lib/web-link'

describe('isWebLink', () => {
  it.each([
    'https://example.com',
    'https://example.com/',
    'https://example.com/notice?id=1#top',
    'https://example.com:8443/a',
    'HTTPS://EXAMPLE.COM/A',
    'http://example.com/plain',
    '  https://example.com/trimmed  ',
  ])('opens %s', url => {
    expect(isWebLink(url)).toBe(true)
  })

  it.each([
    ['the app’s own scheme', 'chatroute://account/delete'],
    ['an Android intent', 'intent://scan/#Intent;scheme=zxing;end'],
    ['a Play Store link', 'market://details?id=com.example'],
    ['a phone number', 'tel:+15555550100'],
    ['an SMS', 'sms:+15555550100'],
    ['mail', 'mailto:someone@example.com'],
    ['script', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<b>x</b>'],
    ['a local file', 'file:///data/user/0/com.thechatroute.app/files/x'],
    ['a content URI', 'content://media/external/images/1'],
    ['a scheme-relative URL', '//example.com/a'],
    ['no scheme', 'example.com/a'],
    ['a scheme with no host', 'https://'],
    ['a scheme with an empty host', 'https:///path'],
    ['https without slashes', 'https:example.com'],
    ['userinfo that hides the host', 'https://example.com@evil.test/'],
    ['a backslash authority', 'https://example.com\\@evil.test'],
    ['an embedded newline', 'https://example.com/\nchatroute://x'],
    ['an embedded space', 'https://exa mple.com'],
    ['the empty string', ''],
  ])('refuses %s', (_, url) => {
    expect(isWebLink(url)).toBe(false)
  })
})
