const {
  adoptSceneLifecycleInAppDelegate,
  // The module under test is CommonJS, because a config plugin is evaluated by
  // the Expo CLI outside Metro and cannot read this repo's TypeScript.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('@/plugins/scene-lifecycle')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { excludeStoreInAppDelegate } = require('@/plugins/backup-exclusion')

/** The launch method of `expo-template-bare-minimum@57.0.27`, verbatim. */
const APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`

describe('adopting the scene life cycle in the AppDelegate', () => {
  const adopted = adoptSceneLifecycleInAppDelegate(APP_DELEGATE)

  it('stops creating the window, which the scene delegate now does', () => {
    expect(adopted).not.toContain('UIWindow(frame:')
    expect(adopted).not.toContain('startReactNative')
  })

  it('is idempotent, because prebuild runs against an existing ios/', () => {
    expect(adoptSceneLifecycleInAppDelegate(adopted)).toBe(adopted)
  })

  it('composes with the backup exclusion in either order', () => {
    const excludedFirst = adoptSceneLifecycleInAppDelegate(excludeStoreInAppDelegate(APP_DELEGATE))
    const adoptedFirst = excludeStoreInAppDelegate(adopted)
    expect(excludedFirst).toBe(adoptedFirst)
  })

  it('refuses a template it does not recognise rather than shipping an app that will not launch', () => {
    const sdk58 = APP_DELEGATE.replace(/#if os\(iOS\)[\s\S]*?#endif\n/, '')
    expect(() => adoptSceneLifecycleInAppDelegate(sdk58)).toThrow(/remove this plugin/)
  })
})
