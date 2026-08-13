import { router } from 'expo-router'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'

export default function SignInScreen() {
  return (
    <View className="flex-1 bg-bg px-4 pt-8">
      <Text className="font-sans text-2xl font-semibold text-ink">Sign in</Text>
      <Text className="mt-2 font-sans text-muted">Not wired · mock role only</Text>
      <Input className="mt-6" placeholder="Email" autoCapitalize="none" editable={false} />
      <Button className="mt-4" onPress={() => router.replace('/')}>
        <Text>Continue</Text>
      </Button>
    </View>
  )
}
