const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

const config = getDefaultConfig(__dirname)

// `expo-sqlite`'s web backend (wa-sqlite) imports its own .wasm binary
// directly (`web/worker.ts`'s `import wasmModule from './wa-sqlite.wasm'`).
// Metro's default `assetExts` has no entry for it, so the web bundler tries
// to parse a wasm binary as JavaScript and fails outright — this is the only
// thing stopping `expo start --web` from bundling at all, since every screen
// pulls the Store in through `lib/conversation-store` -> `expo-sqlite`.
config.resolver.assetExts.push('wasm')

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
})
