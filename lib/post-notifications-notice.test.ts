import type { ApiFailure } from '@/lib/api-result'
import {
  postNotificationsNotice,
  postNotificationsRefusal,
} from '@/lib/post-notifications-notice'

const UNREACHABLE: ApiFailure = { kind: 'unreachable' }
const REFUSED: ApiFailure = { kind: 'refused', message: 'You are not in that organization' }

describe('postNotificationsNotice', () => {
  test('says nothing over switches that are drawn', () => {
    expect(postNotificationsNotice({ drawn: 2, loading: false, failure: null })).toEqual({
      kind: 'none',
    })
  })

  test('is loading before the first answer', () => {
    expect(postNotificationsNotice({ drawn: 0, loading: true, failure: null })).toEqual({
      kind: 'loading',
    })
  })

  test('tells a person in no organization that there is nothing to choose between', () => {
    expect(postNotificationsNotice({ drawn: 0, loading: false, failure: null })).toEqual({
      kind: 'empty',
      title: 'No organizations',
      hint: 'You are not in an organization yet, so there is nothing to be notified about.',
    })
  })

  test('a card that could not be read is a different screen from an empty one', () => {
    expect(postNotificationsNotice({ drawn: 0, loading: false, failure: UNREACHABLE })).toEqual({
      kind: 'failed',
      title: 'Cannot reach the server',
      hint: 'Check your connection and try again.',
    })
  })

  test('titles a refusal in the API’s own words', () => {
    expect(postNotificationsNotice({ drawn: 0, loading: false, failure: REFUSED })).toEqual({
      kind: 'failed',
      title: 'Could not load Post notifications',
      hint: 'You are not in that organization',
    })
  })

  test('asking again over switches already drawn leaves them drawn', () => {
    // The precedence `read-notice` exists to hold: a reload that is in flight
    // does not blank switches somebody can still read.
    expect(postNotificationsNotice({ drawn: 2, loading: true, failure: null })).toEqual({
      kind: 'none',
    })
  })

  test('a failure over switches already drawn is a line rather than a screen', () => {
    expect(postNotificationsNotice({ drawn: 2, loading: false, failure: UNREACHABLE })).toEqual({
      kind: 'stale',
      message: 'No connection. This is what this device already had.',
    })
  })
})

describe('postNotificationsRefusal', () => {
  test('a switch that went back says the network rather than the list’s sentence', () => {
    expect(postNotificationsRefusal(UNREACHABLE)).toBe('No connection. That could not be saved.')
  })

  test('a refusal speaks in the API’s own words', () => {
    expect(postNotificationsRefusal(REFUSED)).toBe('You are not in that organization')
  })

  test('a body this client could not read says so', () => {
    expect(postNotificationsRefusal({ kind: 'malformed' })).toMatch(/did not understand/)
  })

  test('an expired session says nothing, because the screen is leaving', () => {
    expect(postNotificationsRefusal({ kind: 'unauthorised' })).toBeNull()
  })
})
