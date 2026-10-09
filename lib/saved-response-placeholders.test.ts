import { fillPlaceholders } from '@/lib/saved-response-placeholders'

const values = { name: 'Maha Rahman', myName: 'Ray', organization: 'Tech Vanguard' }

test('fills every known placeholder', () => {
  expect(
    fillPlaceholders('Hi {first_name}, {my_name} from {organization} here. ({name})', values),
  ).toBe('Hi Maha, Ray from Tech Vanguard here. (Maha Rahman)')
})

test('ignores case and inner spaces', () => {
  expect(fillPlaceholders('Hi { First_Name }', values)).toBe('Hi Maha')
})

test('uses the fallback when the value is unknown, or leaves it out', () => {
  expect(fillPlaceholders('Hi {first_name|there}!', { name: null })).toBe('Hi there!')
  expect(fillPlaceholders('Hi {first_name}!', { name: '  ' })).toBe('Hi !')
  expect(fillPlaceholders('Hi {first_name|there}!', values)).toBe('Hi Maha!')
})

test('leaves a key it does not know exactly as written', () => {
  expect(fillPlaceholders('Order {order} for {name}', values)).toBe('Order {order} for Maha Rahman')
})

test('leaves text without placeholders alone', () => {
  expect(fillPlaceholders('Plain {{ text }} here', values)).toBe('Plain {{ text }} here')
})
