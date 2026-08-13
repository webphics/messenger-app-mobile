import { Redirect } from 'expo-router'

import { DEV_ROLE, ROLE_HREF } from '@/lib/mock-data'

export default function Index() {
  return <Redirect href={ROLE_HREF[DEV_ROLE]} />
}
