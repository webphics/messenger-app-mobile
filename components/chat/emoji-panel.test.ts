import { readFileSync } from 'node:fs'

/**
 * React Native 0.88 removed `InteractionManager`, and rn-emoji-keyboard calls it
 * while rendering a category, so a release build crashed as the panel opened.
 * `patches/rn-emoji-keyboard@1.7.0.patch` takes it out. This fails if the patch
 * stops applying, a version bump included, before the crash ships again.
 */
test('the installed emoji keyboard never reaches for InteractionManager', () => {
  const sources = [
    'rn-emoji-keyboard/src/components/EmojiCategory.tsx',
    'rn-emoji-keyboard/lib/module/components/EmojiCategory.js',
    'rn-emoji-keyboard/lib/commonjs/components/EmojiCategory.js',
  ].map((path) => readFileSync(require.resolve(path), 'utf8'))

  for (const source of sources) {
    expect(source).not.toMatch(/InteractionManager\s*[.}]|import\s*\{[^}]*InteractionManager/)
  }
})
