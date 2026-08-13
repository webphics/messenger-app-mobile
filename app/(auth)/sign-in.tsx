import { router } from 'expo-router'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { DEV_ROLE, ROLE_HREF } from '@/lib/mock-data'

export default function SignInScreen() {
  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <View className="rounded-2xl border border-line bg-surface p-4">
        <Text className="font-sans text-muted">Not wired · mock role only</Text>
        <Input
          className="mt-6"
          placeholder="Email"
          accessibilityLabel="Email"
          autoCapitalize="none"
          editable={false}
        />
        <Button className="mt-4" onPress={() => router.replace(ROLE_HREF[DEV_ROLE])}>
          <Text>Continue</Text>
        </Button>
      </View>
    </View>
  )
}
