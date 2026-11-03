import { readFileSync } from 'node:fs'

/**
 * expo-router binds its global `router` to the navigation root that mounted
 * last, and its cleanup used to unbind it unconditionally. When Android
 * recreates the activity, after a font or display size change, the new root
 * binds before the old one unmounts, so that cleanup left `router` throwing
 * "unavailable before the first render" for the rest of the session: the launch
 * screen's hand-over crashed, and so would every later navigation.
 * `patches/expo-router@58.0.28.patch` only unbinds when the last root goes.
 * This fails if the patch stops applying, a version bump included.
 */
test('the installed expo-router only unbinds the router when its last root unmounts', () => {
  const source = readFileSync(
    require.resolve('expo-router/build/global-state/routingQueueContext.js'),
    'utf8',
  )

  expect(source).toContain('if (boundBridges === 0) Object.assign(_router.router, _router.unboundRouter);')
})
