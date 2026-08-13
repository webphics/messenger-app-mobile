export type PasswordRuleKey = 'length' | 'upper' | 'lower' | 'digit' | 'symbol'

export type PasswordRules = Record<PasswordRuleKey, boolean>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailLooksValid(email: string): boolean {
  return EMAIL_RE.test(email)
}

export function passwordRules(password: string): PasswordRules {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  }
}

export function passwordScore(
  password: string,
): 'empty' | 'weak' | 'fair' | 'strong' {
  if (!password) return 'empty'
  const passed = Object.values(passwordRules(password)).filter(Boolean).length
  if (passed <= 2) return 'weak'
  if (passed <= 4) return 'fair'
  return 'strong'
}

export function passwordIsValid(password: string): boolean {
  return Object.values(passwordRules(password)).every(Boolean)
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGIT = '23456789'
const SYMBOL = '!@#$%&*'
const ALL = UPPER + LOWER + DIGIT + SYMBOL

export function suggestPassword(rng: () => number = Math.random): string {
  const pick = (s: string) => s[Math.floor(rng() * s.length)] ?? s[0]!
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)]
  while (chars.length < 12) chars.push(pick(ALL))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = chars[i]!
    chars[i] = chars[j]!
    chars[j] = a
  }
  return chars.join('')
}
