// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // eslint-plugin-react-hooks v7 (pulled in by SDK 57) enables the React
    // Compiler rules, which model a Reanimated shared value as a React ref:
    // `immutability` rejects the `sv.value = x` assignment and `refs` rejects
    // passing one into a callback. Both are wrong here — gesture callbacks are
    // worklets that run on the UI thread, never during React's render — and
    // assigning to `.value` is the only way the Reanimated API works.
    //
    // Scoped to the one file that mutates shared values inside Gesture.* rather
    // than every file using useSharedValue, so genuine ref misuse elsewhere is
    // still reported. If you add another gesture-driven component, add it here.
    files: ["components/chat/message-bubble.tsx"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
]);
