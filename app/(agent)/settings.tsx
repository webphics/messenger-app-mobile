import { router } from 'expo-router'

import { PlaceholderScreen } from '@/components/placeholder-screen'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'

export default function AgentSettingsScreen() {
  return (
    <PlaceholderScreen title="Settings" role="agent">
      <Button className="mt-8" variant="outline" onPress={() => router.push('/(auth)/sign-in')}>
        <Text>Sign out</Text>
      </Button>
    </PlaceholderScreen>
  )
}
