import { Redirect } from 'expo-router'

import { DEV_ROLE } from '@/lib/mock-data'

const ROLE_HREF = {
  contact: '/(contact)',
  agent: '/(agent)',
  admin: '/(admin)',
} as const

export default function Index() {
  return <Redirect href={ROLE_HREF[DEV_ROLE]} />
}
