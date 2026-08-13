import { forwardRef, useState, type Ref } from 'react'
import type { TextInput } from 'react-native'

import { Input } from '@/components/ui/input'

type HelpSearchFieldProps = {
  onQuery: (query: string) => void
  placeholder?: string
}

export const HelpSearchField = forwardRef(function HelpSearchField(
  { onQuery, placeholder = 'Search for help' }: HelpSearchFieldProps,
  ref: Ref<TextInput>,
) {
  const [value, setValue] = useState('')

  return (
    <Input
      ref={ref}
      autoFocus
      showSoftInputOnFocus
      value={value}
      onChangeText={(text) => {
        setValue(text)
        onQuery(text)
      }}
      placeholder={placeholder}
      accessibilityLabel={placeholder}
      returnKeyType="search"
      className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none"
    />
  )
})
