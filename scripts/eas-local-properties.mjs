/**
 * Pins the CMake the NDK build runs with, for builds that go through `eas build`.
 *
 * The SDK ships CMake 3.22.1 and AGP picks it unless told otherwise. Under it
 * every CMake project in this tree -- `:app`, reanimated, worklets, screens --
 * dies with
 *
 *     ninja: error: manifest 'build.ninja' still dirty after 100 tries
 *
 * because `file(GLOB ... CONFIGURE_DEPENDS)` re-triggers regeneration on every
 * pass and the regeneration never settles. It reproduces from a fresh
 * `node_modules` on a single ABI, and 3.30.5 builds the same tree without
 * complaint. The build does not fail, it spins until the job's timeout. `cmake.dir` in
 * `android/local.properties` is the only thing AGP reads to override the pick,
 * and EAS runs its own `expo prebuild`, which regenerates that file and drops
 * whatever was in it. So the pin has to be rewritten from inside the build,
 * which is what the `eas-build-post-install` hook in package.json is for.
 *
 * Deliberately a no-op rather than a failure when `android/` is not there yet:
 * the hook's position relative to prebuild is EAS's to decide, and a hook that
 * exits non-zero would fail the build over a file it could simply write later.
 * If the "build.ninja still dirty" loop ever comes back, this ran too early and
 * the pin belongs in `expo-build-properties` in app.json instead -- which is a
 * native config change, so it is not made here.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const android = join(root, "android");

if (!existsSync(android)) {
  console.log("eas-local-properties: android/ not generated yet, nothing to pin.");
  process.exit(0);
}

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk || !existsSync(sdk)) {
  console.warn("eas-local-properties: no ANDROID_HOME, leaving local.properties alone.");
  process.exit(0);
}

// Newest installed at or above 3.30, and a warning rather than an exit when there is none, so a machine without it
// still attempts the build instead of being silently misconfigured here.
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
    'eas-local-properties: no CMake 3.30+ in the SDK. The NDK build will fall back to ' +
      'the default (likely 3.22.1), which loops on "build.ninja still dirty". Install ' +
      'one with sdkmanager "cmake;3.30.5".',
  );
  process.exit(0);
}

// Merge rather than overwrite: EAS's prebuild writes sdk.dir here and the build
// needs to keep it. Forward slashes on both, because local.properties is a Java
// properties file and a lone backslash is an escape.
const file = join(android, "local.properties");
const kept = (existsSync(file) ? readFileSync(file, "utf8") : "")
  .split("\n")
  .filter(line => line.trim() && !line.startsWith("cmake.dir="));

const lines = [...kept];
if (!lines.some(line => line.startsWith("sdk.dir="))) {
  lines.push(`sdk.dir=${sdk.replace(/\\/g, "/")}`);
}
lines.push(`cmake.dir=${cmake.replace(/\\/g, "/")}`);

writeFileSync(file, `${lines.join("\n")}\n`);
console.log(`eas-local-properties: pinned cmake.dir=${cmake}`);
