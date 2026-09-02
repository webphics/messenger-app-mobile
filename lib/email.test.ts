import { emailLooksValid } from '@/lib/email'

describe('emailLooksValid', () => {
  test('simple local@domain.tld', () => {
    expect(emailLooksValid('luis@example.com')).toBe(true)
    expect(emailLooksValid('')).toBe(false)
    expect(emailLooksValid('luis')).toBe(false)
    expect(emailLooksValid('luis@example')).toBe(false)
    expect(emailLooksValid(' luis@example.com ')).toBe(false)
  })
})
