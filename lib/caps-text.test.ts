import { createElement } from 'react'

import { capsText } from '@/lib/caps-text'

describe('capsText', () => {
  it.each([
    ['a single string', 'Support', 'SUPPORT', 'Support'],
    ['a number', 7, '7', '7'],
    ['an interpolated array', ['Members · ', 3], 'MEMBERS · 3', 'Members · 3'],
    ['an array with gaps in it', ['About', null, false, undefined], 'ABOUT', 'About'],
  ])('capitalises %s and keeps the words as written for the label', (_, children, drawn, spoken) => {
    expect(capsText('font-sans uppercase tracking-wider', children)).toEqual({
      className: 'font-sans tracking-wider',
      children: drawn,
      label: spoken,
    })
  })

  it('drops the class so Android never measures before a transform', () => {
    expect(capsText('uppercase', 'Account')?.className).toBe('')
  })

  it.each([
    ['no uppercase class', 'text-xs tracking-wider', 'Account'],
    ['a class that only contains the word', 'ios:uppercase', 'Account'],
    ['a nested element', 'uppercase', createElement('span', null, 'Account')],
    ['an array holding an element', 'uppercase', ['Ends ', createElement('span', null, 'today')]],
  ])('leaves %s alone', (_, className, children) => {
    expect(capsText(className, children)).toBeNull()
  })
})
