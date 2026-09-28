/**
 * The pure half of `with-scene-lifecycle`: the text transforms, kept free of
 * `expo/config-plugins` so a test can run them against the template.
 *
 * The iOS 27 SDK refuses to launch an app that has not adopted the UIScene life
 * cycle ("UIScene life cycle is required for apps built with this SDK"). SDK 57's
 * template predates that and SDK 58's adopts it. `expo` 57 already ships the
 * runtime half, `ExpoAppSceneDelegate`, and its `SceneEventForwarder` dedupes the
 * links an SDK 57 AppDelegate still hands to `RCTLinkingManager`. What is missing
 * is the project half, which is what SDK 58's template carries and this restores:
 *
 * - a `SceneDelegate` subclassing `ExpoAppSceneDelegate`,
 * - `UIApplicationSceneManifest` in Info.plist naming it,
 * - an AppDelegate that conforms to `ExpoReactNativeFactoryProvider` and no
 *   longer creates the window, because the scene delegate does.
 *
 * Delete this plugin when the app moves to SDK 58.
 */

const SCENE_DELEGATE_FILE = "SceneDelegate.swift"

const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
}

const CLASS_DECLARATION = "class AppDelegate: ExpoAppDelegate {"
const PROVIDER_DECLARATION = "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {"

// The template's window creation, as SDK 57 writes it. Matched loosely on
// whitespace so a reformatted template still matches, and nowhere else.
const WINDOW_BLOCK =
  /[ \t]*#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\([\s\S]*?\)\s*#endif[ \t]*\n/

function adoptSceneLifecycleInAppDelegate(source) {
  // Idempotent: prebuild can run repeatedly against an existing ios/.
  if (source.includes(PROVIDER_DECLARATION)) return source

  if (!source.includes(CLASS_DECLARATION) || !WINDOW_BLOCK.test(source)) {
    throw new Error(
      "with-scene-lifecycle: AppDelegate.swift does not match the SDK 57 template. " +
        "If the app is on SDK 58 or later, remove this plugin; the template adopts the scene life cycle itself.",
    )
  }

  return source
    .replace(CLASS_DECLARATION, PROVIDER_DECLARATION)
    .replace(
      WINDOW_BLOCK,
      "    // The window is created and React Native is started by `SceneDelegate`\n" +
        "    // under the scene-based life cycle (required by the iOS 27 SDK).\n",
    )
}

module.exports = {
  SCENE_DELEGATE_FILE,
  SCENE_DELEGATE_SOURCE,
  SCENE_MANIFEST,
  adoptSceneLifecycleInAppDelegate,
}
