import { router } from 'expo-router'
import { Pressable, View } from 'react-native'

import { PlaceholderScreen } from '@/components/placeholder-screen'
import { Text } from '@/components/ui/text'

export default function ContactHomeScreen() {
  return (
    <PlaceholderScreen>
      <View className="mt-6 gap-4">
        <Pressable
          className="min-h-11 justify-center"
          accessibilityRole="button"
          accessibilityLabel="Messages"
          onPress={() => router.push('/(contact)/messages')}
        >
          <Text className="font-sans text-primary">Messages</Text>
        </Pressable>
        <Pressable
          className="min-h-11 justify-center"
          accessibilityRole="button"
          accessibilityLabel="Help"
          onPress={() => router.push('/(contact)/help')}
        >
          <Text className="font-sans text-primary">Help</Text>
        </Pressable>
        <Pressable
          className="min-h-11 justify-center"
          accessibilityRole="button"
          accessibilityLabel="Open sample chat"
          onPress={() => router.push('/chat/conv-assigned')}
        >
          <Text className="font-sans text-primary">Open sample chat</Text>
        </Pressable>
        <Pressable
          className="min-h-11 justify-center"
          accessibilityRole="button"
          accessibilityLabel="Join Offers chat"
          onPress={() => router.push('/chat/offers')}
        >
          <Text className="font-sans text-primary">Join Offers chat</Text>
        </Pressable>
      </View>
    </PlaceholderScreen>
  )
}
