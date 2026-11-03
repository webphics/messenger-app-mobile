import { Platform } from "react-native";

import { APP_VERSION } from "@/lib/app-update";
import { appUserAgent } from "@/lib/user-agent";

/**
 * This build's User-Agent, read once off the device, or null on web, where the
 * browser sends its own and refuses to let a page replace it.
 *
 * Every transport here honours a caller's User-Agent over its own default:
 * Expo's `fetch` and `File.upload` hand the header to okhttp and URLSession,
 * which add theirs only when none was given, and React Native's WebSocket does
 * the same for the socket's handshake. See `lib/user-agent` for the format.
 */
function readAppUserAgent(): string | null {
  const version = APP_VERSION ?? "0";
  if (Platform.OS === "android") {
    return appUserAgent({
      version,
      platform: "android",
      osVersion: Platform.constants.Release,
      model: Platform.constants.Model,
      tablet: false,
    });
  }
  if (Platform.OS === "ios") {
    return appUserAgent({
      version,
      platform: "ios",
      osVersion: Platform.constants.osVersion,
      model: null,
      tablet: Platform.isPad,
    });
  }
  return null;
}

export const APP_USER_AGENT = readAppUserAgent();

/** The header, ready to spread, or nothing on web. */
export function userAgentHeaders(): Record<string, string> {
  return APP_USER_AGENT ? { "User-Agent": APP_USER_AGENT } : {};
}
