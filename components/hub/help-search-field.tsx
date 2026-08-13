import { useState } from 'react'

import { Input } from '@/components/ui/input'

type HelpSearchFieldProps = {
  onQuery: (query: string) => void
}

export function HelpSearchField({ onQuery }: HelpSearchFieldProps) {
  const [value, setValue] = useState('')

  return (
    <Input
      autoFocus
      value={value}
      onChangeText={(text) => {
        setValue(text)
        onQuery(text)
      }}
      placeholder="Search for help"
      accessibilityLabel="Search for help"
      returnKeyType="search"
      className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none"
    />
  )
}
