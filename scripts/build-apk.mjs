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

writeFileSync(join(android, "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "/")}\n`);

const env = {
  ...process.env,
  JAVA_HOME: jdk,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  PATH: `${join(jdk, "bin")}${win ? ";" : ":"}${join(sdk, "platform-tools")}${win ? ";" : ":"}${process.env.PATH ?? ""}`,
};

const gradle = win ? "gradlew.bat" : "./gradlew";
const result = spawnSync(
  gradle,
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
const out = join(dist, "internal-support-messenger-release.apk");
copyFileSync(apk, out);
console.log(`APK: ${out}`);
