/**
 * Copies `version` from package.json into `expo.version` in app.json.
 *
 * Run by npm's `version` lifecycle (see `pnpm release` in package.json): npm
 * has already bumped package.json by then and is about to commit, so this only
 * has to make app.json agree and stage it. The Android Release workflow fails a
 * tag whose version differs from `expo.version`, which is what this keeps from
 * happening.
 *
 * The line is rewritten in place rather than through JSON.stringify, which would
 * reflow app.json's inline arrays and turn a version bump into a whole-file diff.
 */

import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("app.json", "utf8");

// Two tabs or four spaces: app.json has been indented both ways.
const pattern = /^((?:\t\t|\s{4})"version":\s*)"[^"]*"/m;
if (!pattern.test(source)) {
  console.error('app.json has no `"version"` line at the top of `expo` to update.');
  process.exit(1);
}

writeFileSync("app.json", source.replace(pattern, `$1"${version}"`));
console.log(`app.json expo.version -> ${version}`);
