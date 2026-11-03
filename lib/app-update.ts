import Constants from "expo-constants";
import { Platform } from "react-native";

import { asRecord } from "@/lib/api-envelope";

/**
 * Whether this build is still one the API serves.
 *
 * Two ways to learn it, and both land here. On launch and on every return to
 * the foreground `UpdateGate` asks `GET /app-version`; and every other request
 * this build makes can be refused with `426 update_required`, which
 * `lib/api-client` reports the moment it arrives. The second is what catches a
 * build that stayed open across the API raising its floor.
 *
 * Kept free of the transport so `lib/api-client` can import it without a cycle.
 * See `api/docs/api/app-version.md` for the server half.
 */

/** The API's code for a build below its minimum. */
export const UPDATE_REQUIRED_CODE = "update_required";
export const UPDATE_REQUIRED_STATUS = 426;

export type UpdateVerdict = "none" | "available" | "required";

export type UpdateState = {
  verdict: UpdateVerdict;
  latestVersion: string | null;
  storeUrl: string | null;
};

/**
 * This build's version: `expo.version` from app.json, which `pnpm release`
 * bumps. Read from the embedded config rather than a native module, and
 * correct for as long as over-the-air updates stay disabled, which app.json
 * says they are.
 */
export const APP_VERSION = Constants.expoConfig?.version ?? null;

const NATIVE_PLATFORM =
  Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : null;

/**
 * The two headers that let the API judge this build. Empty on web, which the
 * API never gates and whose CORS list would refuse the headers anyway.
 */
export function appVersionHeaders(): Record<string, string> {
  if (!NATIVE_PLATFORM || !APP_VERSION) return {};
  return { "x-app-platform": NATIVE_PLATFORM, "x-app-version": APP_VERSION };
}

/** Where the update button goes when the API names no store page. */
export const FALLBACK_STORE_URL: string | null =
  NATIVE_PLATFORM === "android"
    ? "market://details?id=com.thechatroute.app"
    : null;

const VERDICTS: readonly UpdateVerdict[] = ["none", "available", "required"];

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The verdict `GET /app-version` returned, or null for any body that is not one. */
export function readVersionCheck(body: unknown): UpdateState | null {
  const data = asRecord(asRecord(body)?.data);
  const verdict = VERDICTS.find((candidate) => candidate === data?.update);
  if (!data || !verdict) return null;

  return {
    verdict,
    latestVersion: readNullableString(data.latestVersion),
    storeUrl: readNullableString(data.storeUrl),
  };
}

/** A `426 update_required` refusal from any route, read as the state it implies. Null for anything else. */
export function readUpdateRefusal(status: number, body: unknown): UpdateState | null {
  const record = asRecord(body);
  if (status !== UPDATE_REQUIRED_STATUS || record?.code !== UPDATE_REQUIRED_CODE) {
    return null;
  }

  const meta = asRecord(record.meta);
  return {
    verdict: "required",
    latestVersion: readNullableString(meta?.latestVersion),
    storeUrl: readNullableString(meta?.storeUrl),
  };
}

const INITIAL: UpdateState = { verdict: "none", latestVersion: null, storeUrl: null };

let current: UpdateState = INITIAL;
const listeners = new Set<() => void>();

export function getUpdateState(): UpdateState {
  return current;
}

/**
 * Record what the API said. `required` is sticky for the life of the process:
 * a version check that fails to reach the API, or a later route that happens
 * to answer, must not lift a refusal the API has already made.
 */
export function setUpdateState(next: UpdateState): void {
  if (current.verdict === "required" && next.verdict !== "required") return;
  if (
    current.verdict === next.verdict &&
    current.latestVersion === next.latestVersion &&
    current.storeUrl === next.storeUrl
  ) {
    return;
  }

  current = next;
  for (const listener of listeners) listener();
}

export function subscribeUpdateState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: forget every verdict. */
export function resetUpdateStateForTests(): void {
  current = INITIAL;
}
