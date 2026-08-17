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
// so pass --prebuild after changing app.json or a plugin.
function prebuild(reason) {
  console.log(`expo prebuild --platform android (${reason})`);
  const run = spawnSync(
    win ? "npx.cmd" : "npx",
    ["expo", "prebuild", "--platform", "android", "--no-install"],
    { cwd: root, stdio: "inherit", shell: win },
  );
  if (run.status !== 0) process.exit(run.status ?? 1);
}

if (process.argv.includes("--prebuild")) prebuild("--prebuild requested");
else if (!existsSync(android)) prebuild("android/ is missing");

writeFileSync(join(android, "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "/")}\n`);

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
  ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a"],
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
