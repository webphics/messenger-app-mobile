// `lib/api-config` resolves EXPO_PUBLIC_API_URL at import and throws when it is
// missing — that is the point of it. Metro reads the value from .env; Jest has
// no .env, so supply one here rather than weakening the check the app relies on.
process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:8080";

// Same reason: `lib/google-config` resolves its OAuth clients at import and
// warns when there are none. These are shapes, not credentials — the real web
// client ID is the one the web client and the API share, and it lives in .env.
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID =
  "000000000000-jestweb.apps.googleusercontent.com";
process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID =
  "000000000000-jestios.apps.googleusercontent.com";
