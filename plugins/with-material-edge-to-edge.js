const { withAppBuildGradle } = require("expo/config-plugins");

// Screens 4.30.1 requests Material 1.13.0. Version 1.14.0 guards the
// BottomSheetDialog system-bar color calls on Android 15 and newer.
const DEPENDENCY = "com.google.android.material:material:1.14.0";

module.exports = function withMaterialEdgeToEdge(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("with-material-edge-to-edge requires a Groovy app/build.gradle");
    }
    if (mod.modResults.contents.includes(DEPENDENCY)) return mod;
    mod.modResults.contents += `
dependencies {
    constraints {
        implementation("${DEPENDENCY}") {
            because("Use Android 15 system-bar handling in Material bottom sheets")
        }
    }
}
`;
    return mod;
  });
};
