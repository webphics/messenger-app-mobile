/**
 * Applies the Android system-bar handling that this app depends on, as a
 * prebuild mod rather than a hand edit — `expo prebuild` regenerates
 * MainActivity.kt from template, so a manual patch is lost on every native
 * rebuild (and `/android` is gitignored, so it is lost per machine too).
 *
 * Two behaviours, both documented in AGENTS.md:
 *
 * 1. `applyLightSystemBars` — paint `window.decorView` white so the strips left
 *    by the inset padding below match the hub background. AppTheme's DayNight
 *    parent would otherwise resolve them to black on dark-mode phones.
 * 2. `applySystemBarInsets` — Android 15+ draws behind the system bars, and
 *    safe-area-context's getGlobalVisibleRect math reports 0 on a standalone
 *    APK. Pad `android.R.id.content` instead, and consume only the system-bar
 *    and display-cutout insets so IME insets still drive keyboard `resize`.
 *
 * Both calls must run AFTER `super.onCreate` — the content view does not exist
 * before it.
 */

// Unique to the CURRENT implementation (the old plugin painted statusBarColor /
// navigationBarColor directly and never called decorView.setBackgroundColor), so
// this correctly distinguishes "already patched with this version" from "patched
// by a stale, pre-decorView-paint version of this plugin".
const MARKER = "decorView.setBackgroundColor";
// Present in both the old and the new patch — used only to detect the stale case.
const STALE_MARKER = "private fun applyLightSystemBars";

const IMPORTS = [
  "import android.graphics.Color",
  "import android.view.View",
  "import androidx.core.graphics.Insets",
  "import androidx.core.view.ViewCompat",
  "import androidx.core.view.WindowInsetsCompat",
  "import androidx.core.view.WindowInsetsControllerCompat",
];

const METHODS = `
  /**
   * \`window.statusBarColor\` / \`navigationBarColor\` are NO-OPS on API 35+, and
   * AppTheme's DayNight parent resolves \`windowBackground\` to BLACK when the
   * phone's system theme is dark. \`applySystemBarInsets\` pads the content view,
   * so those strips expose the window background — hence black bars on
   * dark-mode devices only. Paint the decor view instead; it is the surface the
   * strips actually show. Mirrored in app/_layout.tsx for the dev client.
   * DO NOT reinstate those setters; they silently do nothing.
   */
  private fun applyLightSystemBars() {
    val bg = Color.parseColor("#FFFFFF")
    window.decorView.setBackgroundColor(bg)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }
    WindowInsetsControllerCompat(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
  }

  /**
   * Android 15+ draws behind system bars. safe-area-context's getGlobalVisibleRect
   * math often reports 0 on a standalone APK; pad the window content view instead.
   * IME insets stay unconsumed so keyboard \`resize\` still works.
   */
  private fun applySystemBarInsets(content: View) {
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, windowInsets ->
      val sys =
        windowInsets.getInsets(
          WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
        )
      v.setPadding(sys.left, sys.top, sys.right, sys.bottom)
      WindowInsetsCompat.Builder(windowInsets)
        .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.NONE)
        .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
        .build()
    }
  }
`;

function addImports(src) {
  const missing = IMPORTS.filter((line) => !src.includes(line));
  if (missing.length === 0) return src;

  // Anchor on the Bundle import, which the template always emits.
  const anchor = "import android.os.Bundle";
  if (!src.includes(anchor)) {
    throw new Error(
      "with-system-bar-insets: could not find `import android.os.Bundle` in MainActivity.kt",
    );
  }
  return src.replace(anchor, `${anchor}\n${missing.join("\n")}`);
}

function addCalls(src) {
  const anchor = "super.onCreate(null)";
  if (!src.includes(anchor)) {
    throw new Error(
      "with-system-bar-insets: could not find `super.onCreate(null)` in MainActivity.kt",
    );
  }
  // Idempotent: the call text is identical between the old and new patch, so if
  // both calls are already present anywhere in the file, don't add a second copy.
  if (
    src.includes("applyLightSystemBars()") &&
    src.includes("applySystemBarInsets(findViewById(android.R.id.content))")
  ) {
    return src;
  }
  return src.replace(
    anchor,
    `${anchor}\n    applyLightSystemBars()\n    applySystemBarInsets(findViewById(android.R.id.content))`,
  );
}

function addMethods(src) {
  // Reliably splicing out the OLD applyLightSystemBars body (nested `if` /
  // `.apply {}` blocks) and replacing it in place is fragile with a regex — a
  // wrong match risks emitting silently-broken Kotlin. The caller already
  // throws on the stale-patch case before this runs, so by the time we get
  // here `src` is guaranteed to be a fresh, unpatched template. Guard anyway.
  if (src.includes(STALE_MARKER)) {
    throw new Error(
      "with-system-bar-insets: MainActivity.kt already has an outdated applyLightSystemBars " +
        "patch. Run `expo prebuild --clean -p android` to regenerate from a clean template.",
    );
  }
  // Insert above getMainComponentName's KDoc, not between the doc and the
  // function — splitting those would orphan the comment onto our methods.
  const anchor = /(\n[ \t]*\/\*\*(?:(?!\*\/)[\s\S])*?\*\/\n)?([ \t]*override fun getMainComponentName\()/;
  if (!anchor.test(src)) {
    throw new Error(
      "with-system-bar-insets: could not find `getMainComponentName` in MainActivity.kt",
    );
  }
  return src.replace(anchor, (_match, doc, decl) => `\n${METHODS}${doc ?? "\n"}${decl}`);
}

const { withMainActivity, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withTransparentSplashScreenLogo(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const resDir = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable");
      if (!fs.existsSync(resDir)) {
        fs.mkdirSync(resDir, { recursive: true });
      }
      const logoXml = path.join(resDir, "splashscreen_logo.xml");
      const content = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="@android:color/transparent"/>
    <size android:width="1dp" android:height="1dp"/>
</shape>
`;
      fs.writeFileSync(logoXml, content, "utf-8");
      return mod;
    },
  ]);
}

module.exports = function withSystemBarInsets(config) {
  config = withTransparentSplashScreenLogo(config);
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== "kt") {
      throw new Error(
        `with-system-bar-insets: expected a Kotlin MainActivity, got ${mod.modResults.language}`,
      );
    }
    // Idempotent: prebuild can run repeatedly against an existing android/.
    if (mod.modResults.contents.includes(MARKER)) return mod;
    // A project patched by a STALE (pre-decorView-paint) version of this plugin
    // won't match MARKER above but does still have the old method — running the
    // adders against it would double-insert imports/calls/methods and produce
    // uncompilable Kotlin. Fail loudly instead of guessing.
    if (mod.modResults.contents.includes(STALE_MARKER)) {
      throw new Error(
        "with-system-bar-insets: MainActivity.kt was patched by an outdated version of this " +
          "plugin (it still sets window.statusBarColor instead of painting decorView). " +
          "Run `expo prebuild --clean -p android` to regenerate the native project, then retry.",
      );
    }

    let src = mod.modResults.contents;
    src = addImports(src);
    src = addCalls(src);
    src = addMethods(src);
    mod.modResults.contents = src;
    return mod;
  });
};
