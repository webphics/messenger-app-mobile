/**
 * Adopts the UIScene life cycle on iOS, which the iOS 27 SDK requires before an
 * app will launch. What and why: `scene-lifecycle.js`.
 */

const fs = require("fs")
const path = require("path")
const { IOSConfig, withAppDelegate, withInfoPlist, withXcodeProject } = require("expo/config-plugins")

const {
  SCENE_DELEGATE_FILE,
  SCENE_DELEGATE_SOURCE,
  SCENE_MANIFEST,
  adoptSceneLifecycleInAppDelegate,
} = require("./scene-lifecycle")

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = SCENE_MANIFEST
    return mod
  })
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error(`with-scene-lifecycle: expected a Swift AppDelegate, got ${mod.modResults.language}`)
    }
    mod.modResults.contents = adoptSceneLifecycleInAppDelegate(mod.modResults.contents)
    return mod
  })
}

function withSceneDelegateFile(config) {
  return withXcodeProject(config, (mod) => {
    const { projectName, platformProjectRoot } = mod.modRequest
    fs.writeFileSync(
      path.join(platformProjectRoot, projectName, SCENE_DELEGATE_FILE),
      SCENE_DELEGATE_SOURCE,
      "utf-8",
    )

    const filepath = `${projectName}/${SCENE_DELEGATE_FILE}`
    if (!mod.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: mod.modResults,
      })
    }
    return mod
  })
}

module.exports = function withSceneLifecycle(config) {
  config = withSceneManifest(config)
  config = withSceneAppDelegate(config)
  return withSceneDelegateFile(config)
}
