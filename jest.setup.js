// `lib/api-config` resolves EXPO_PUBLIC_API_URL at import and throws when it is
// missing — that is the point of it. Metro reads the value from .env; Jest has
// no .env, so supply one here rather than weakening the check the app relies on.
process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:8080";
