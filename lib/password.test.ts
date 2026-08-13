import {
  emailLooksValid,
  passwordIsValid,
  passwordRules,
  passwordScore,
  suggestPassword,
} from '@/lib/password'

describe('emailLooksValid', () => {
  test('simple local@domain.tld', () => {
    expect(emailLooksValid('luis@example.com')).toBe(true)
    expect(emailLooksValid('')).toBe(false)
    expect(emailLooksValid('luis')).toBe(false)
    expect(emailLooksValid('luis@example')).toBe(false)
    expect(emailLooksValid(' luis@example.com ')).toBe(false)
  })
})

describe('passwordRules', () => {
  test('flags each rule', () => {
    expect(passwordRules('Short1!')).toEqual({
      length: false,
      upper: true,
      lower: true,
      digit: true,
      symbol: true,
    })
    expect(passwordRules('longenough')).toEqual({
      length: true,
      upper: false,
      lower: true,
      digit: false,
      symbol: false,
    })
    expect(passwordRules('Aa1!aaaa')).toEqual({
      length: true,
      upper: true,
      lower: true,
      digit: true,
      symbol: true,
    })
  })
})

describe('passwordScore', () => {
  test('empty / weak / fair / strong', () => {
    expect(passwordScore('')).toBe('empty')
    expect(passwordScore('a')).toBe('weak')
    expect(passwordScore('aA1xxxxx')).toBe('fair')
    expect(passwordScore('Aa1!aaaa')).toBe('strong')
  })
})

describe('passwordIsValid', () => {
  test('all five rules', () => {
    expect(passwordIsValid('Aa1!aaaa')).toBe(true)
    expect(passwordIsValid('Aa1aaaaa')).toBe(false)
  })
})

describe('suggestPassword', () => {
  test('always passes validator', () => {
    const rng = () => 0
    expect(passwordIsValid(suggestPassword(rng))).toBe(true)
    expect(passwordIsValid(suggestPassword())).toBe(true)
  })
})
