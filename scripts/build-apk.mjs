import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const android = join(root, "android");
const win = process.platform === "win32";

function javaHome() {
  const fromEnv = process.env.JAVA_HOME;
  if (fromEnv && existsSync(join(fromEnv, "bin", win ? "java.exe" : "java"))) {
    return fromEnv;
  }
  if (!win) return null;
  const ms = "C:\\Program Files\\Microsoft";
  if (!existsSync(ms)) return null;
  const hit = readdirSync(ms).find((n) => n.startsWith("jdk-17"));
  return hit ? join(ms, hit) : null;
}

function androidHome() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const fallback = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Android", "Sdk");
  return existsSync(fallback) ? fallback : null;
}

// CMake mangles a C++ file's whole source path into its object name, on top of
// an already deep `.cxx` directory. Past roughly 180 characters of prefix,
// react-native-screens and react-native-worklets stop converging and the native
// build spins on `ninja: error: manifest 'build.ninja' still dirty after 100
// tries`. The repo root sits at 154 and builds; `.claude/worktrees/<branch>/`
// adds ~59 and does not. Enabling long paths in the registry does not help —
// ninja is not long-path aware — and neither does `subst`, because Expo's
// autolinking hands Gradle the realpath of every module.
const OBJECT_DIR_MAX = 180;
const deepestObjectDir = join(
  root, "node_modules", "react-native-worklets", "android",
  ".cxx", "RelWithDebInfo", "xxxxxxxx", "arm64-v8a", "CMakeFiles", "worklets.dir",
);
if (win && deepestObjectDir.length > OBJECT_DIR_MAX && !process.env.ALLOW_DEEP_BUILD_PATH) {
  console.error(
    `Project path is too deep for the native build: the CMake object directory would be ` +
      `${deepestObjectDir.length} characters (limit ${OBJECT_DIR_MAX}).\n` +
      `  ${root}\n` +
      `Build from the repo root instead of a nested worktree, or create the worktree at a ` +
      `short path (git worktree add D:\\wt\\<name>).\n` +
      `Set ALLOW_DEEP_BUILD_PATH=1 to try anyway.`,
  );
  process.exit(1);
}

const jdk = javaHome();
const sdk = androidHome();
if (!jdk) {
  console.error("JDK 17 not found. Install Microsoft.OpenJDK.17 or set JAVA_HOME.");
  process.exit(1);
}
if (!sdk) {
  console.error("Android SDK not found. Set ANDROID_HOME or install cmdline-tools under %LOCALAPPDATA%\\Android\\Sdk.");
  process.exit(1);
}

// `android/` is gitignored and generated, so it is absent in a fresh clone or a
// git worktree. Generate it rather than failing on a missing local.properties.
// Config-plugin output (see plugins/with-system-bar-insets.js) lands here too,
// so pass --prebuild after changing app.json or a plugin — and it MUST be a
// `--clean` prebuild: the plugin's idempotency marker can only detect "this
// project already has the CURRENT patch applied", not "this project has a
// STALE patch from a previous version of the plugin". A non-clean prebuild
// against a stale android/ either leaves the old patch in place unnoticed, or
// (once the plugin detects the mismatch) throws rather than silently
// miscompiling. `--clean` regenerates the native project from template so the
// current plugin version always applies cleanly.
function prebuild(reason) {
  console.log(`expo prebuild --platform android --clean (${reason})`);
  const run = spawnSync(
    win ? "npx.cmd" : "npx",
    ["expo", "prebuild", "--platform", "android", "--clean", "--no-install"],
    { cwd: root, stdio: "inherit", shell: win },
  );
  if (run.status !== 0) process.exit(run.status ?? 1);
}

if (process.argv.includes("--prebuild")) prebuild("--prebuild requested");
else if (!existsSync(android)) prebuild("android/ is missing");

const resDir = join(android, "app", "src", "main", "res", "drawable");
if (!existsSync(resDir)) mkdirSync(resDir, { recursive: true });
const logoXml = join(resDir, "splashscreen_logo.xml");
if (!existsSync(logoXml)) {
  writeFileSync(
    logoXml,
    `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android"\n    android:shape="rectangle">\n    <solid android:color="@android:color/transparent"/>\n    <size android:width="1dp" android:height="1dp"/>\n</shape>\n`,
  );
}

/**
 * The CMake the NDK build runs with, and the reason this is not left to default.
 *
 * The SDK ships 3.22.1 and AGP picks it unless told otherwise. Under it every CMake
 * project in this build -- `:app`, reanimated, worklets, screens -- dies with
 *
 *     ninja: error: manifest 'build.ninja' still dirty after 100 tries
 *
 * because `file(GLOB ... CONFIGURE_DEPENDS)` re-triggers regeneration on every pass
 * and the regeneration never settles. It is not the path-length trap guarded above,
 * not stale `.cxx` output, and not a dependency state: it reproduces from a fresh
 * `node_modules` on a single ABI. 3.30.5 builds the same tree without complaint.
 *
 * Picks the newest installed version at or above 3.30, and says so rather than
 * failing when there is none, so a machine with only 3.22.1 still attempts the build
 * instead of being silently misconfigured here.
 */
function cmakeDir() {
  const cmakeRoot = join(sdk, "cmake");
  if (!existsSync(cmakeRoot)) return null;

  const usable = readdirSync(cmakeRoot)
    .map(name => ({ name, parts: name.split(".").map(Number) }))
    .filter(v => v.parts.length >= 2 && v.parts.every(Number.isFinite))
    .filter(v => v.parts[0] > 3 || (v.parts[0] === 3 && v.parts[1] >= 30))
    .sort(
      (a, b) =>
        b.parts[0] - a.parts[0] ||
        b.parts[1] - a.parts[1] ||
        (b.parts[2] ?? 0) - (a.parts[2] ?? 0),
    );

  return usable.length > 0 ? join(cmakeRoot, usable[0].name) : null;
}

const cmake = cmakeDir();
if (!cmake) {
  console.warn(
    'No CMake 3.30+ in the SDK. The NDK build will fall back to the default (likely ' +
      "3.22.1), which loops on \"build.ninja still dirty\". Install one with " +
      'sdkmanager "cmake;3.30.5".',
  );
}

// Forward slashes on both: local.properties is a Java properties file, so a lone
// backslash is an escape and the path arrives with its separators eaten.
writeFileSync(
  join(android, "local.properties"),
  `sdk.dir=${sdk.replace(/\\/g, "/")}\n` +
    (cmake ? `cmake.dir=${cmake.replace(/\\/g, "/")}\n` : ""),
);

const env = {
  ...process.env,
  JAVA_HOME: jdk,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  PATH: `${join(jdk, "bin")}${win ? ";" : ":"}${join(sdk, "platform-tools")}${win ? ";" : ":"}${process.env.PATH ?? ""}`,
};

// Absolute path, not a bare name: the .bat needs `shell: true` on Windows, and
// cmd.exe skips the working directory when NoDefaultCurrentDirectoryInExePath
// is set, so `gradlew.bat` alone is "not recognized" even from inside android/.
const gradle = join(android, win ? "gradlew.bat" : "gradlew");
const result = spawnSync(
  win ? `"${gradle}"` : gradle,
  ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a,x86_64"],
  { cwd: android, env, stdio: "inherit", shell: win },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const apk = join(android, "app", "build", "outputs", "apk", "release", "app-release.apk");
if (!existsSync(apk)) {
  console.error("Gradle succeeded but app-release.apk is missing.");
  process.exit(1);
}
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });
const out = join(dist, "enki-release.apk");
copyFileSync(apk, out);
console.log(`APK: ${out}`);
