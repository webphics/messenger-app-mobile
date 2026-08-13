import { router } from 'expo-router'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'

export function SignOutButton() {
  return (
    <Button className="mt-8" variant="outline" onPress={() => router.replace('/(auth)/sign-in')}>
      <Text>Sign out</Text>
    </Button>
  )
}
