/**
 * Sends the build a Production tag uploaded to App Review, and has Apple release
 * it to the App Store once approved. Run by the `app-store-review` job in
 * .github/workflows/ios-release.yml.
 *
 * `eas submit` stops at App Store Connect. Everything after that is this script:
 * wait for Apple to process the build, put it on the App Store version, set
 * What's New from release-notes/<version>.md and the search keywords from
 * store-listing/app-store-keywords.txt, and submit.
 *
 * Keywords are set here because Apple only accepts them on a version that has
 * not been submitted, and this script submits the version it creates without a
 * pause in which anybody could edit it in App Store Connect.
 *
 * Every step checks what is already there, so "Re-run failed jobs" continues a
 * submission that stopped part-way. A version already with Apple exits cleanly.
 *
 * The API key needs the App Manager or Admin role. Node's own crypto and fetch
 * do the work, so no third-party package handles the key.
 */

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

import { readKeywords } from "./app-store-keywords.mjs";

const API = "https://api.appstoreconnect.apple.com";
const BUILD_POLL_MS = 30_000;
const BUILD_WAIT_MS = 60 * 60_000;
const WHATS_NEW_LIMIT = 4000;

/** States in which Apple still accepts changes to a version. */
const EDITABLE = new Set([
	"PREPARE_FOR_SUBMISSION",
	"READY_FOR_REVIEW",
	"DEVELOPER_REJECTED",
	"REJECTED",
	"METADATA_REJECTED",
	"INVALID_BINARY",
]);

/** States that block a different version from being submitted. */
const WITH_APPLE = new Set([
	"WAITING_FOR_EXPORT_COMPLIANCE",
	"WAITING_FOR_REVIEW",
	"IN_REVIEW",
	"ACCEPTED",
	"PENDING_APPLE_RELEASE",
	"PENDING_DEVELOPER_RELEASE",
	"PROCESSING_FOR_DISTRIBUTION",
]);

/** States that mean a version has reached the App Store. */
const LIVE = new Set(["READY_FOR_DISTRIBUTION", "READY_FOR_SALE", "REPLACED_WITH_NEW_VERSION"]);

function requireEnv(name) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set.`);
	return value;
}

const appId = requireEnv("ASC_APP_ID");
const keyId = requireEnv("ASC_API_KEY_ID");
const issuerId = requireEnv("ASC_API_KEY_ISSUER_ID");
const privateKey = createPrivateKey(requireEnv("ASC_API_KEY_P8"));
const version = requireEnv("APP_VERSION");
const whatsNew = readFileSync(requireEnv("RELEASE_NOTES_FILE"), "utf8").trim();

if (!whatsNew) throw new Error("The release notes file is empty.");
if (whatsNew.length > WHATS_NEW_LIMIT) {
	throw new Error(`The release notes are ${whatsNew.length} characters. Apple allows ${WHATS_NEW_LIMIT}.`);
}
const keywords = readKeywords(requireEnv("KEYWORDS_FILE"));

function base64url(value) {
	return Buffer.from(value).toString("base64url");
}

/** A fresh token per request, because waiting for a build outlasts Apple's 20-minute limit. */
function token() {
	const now = Math.floor(Date.now() / 1000);
	const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
	const claims = base64url(
		JSON.stringify({ iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }),
	);
	const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
		key: privateKey,
		dsaEncoding: "ieee-p1363",
	});
	return `${header}.${claims}.${signature.toString("base64url")}`;
}

async function request(method, path, body) {
	const response = await fetch(`${API}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (response.status === 204) return null;
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
	}
	return text ? JSON.parse(text) : null;
}

const stateOf = (item) => item.attributes.appVersionState ?? item.attributes.appStoreState;

async function waitForBuild() {
	const query = new URLSearchParams({
		"filter[app]": appId,
		"filter[preReleaseVersion.version]": version,
		"filter[preReleaseVersion.platform]": "IOS",
		sort: "-uploadedDate",
		limit: "1",
	});
	const deadline = Date.now() + BUILD_WAIT_MS;

	while (Date.now() < deadline) {
		const { data } = await request("GET", `/v1/builds?${query}`);
		const build = data[0];
		const state = build?.attributes.processingState;
		if (state === "VALID") {
			console.log(`Build ${build.attributes.version} is processed.`);
			return build;
		}
		if (state === "FAILED" || state === "INVALID") {
			throw new Error(`Apple marked the ${version} build ${state}.`);
		}
		console.log(`Waiting for the ${version} build: ${state ?? "not visible yet"}.`);
		await new Promise((resolve) => setTimeout(resolve, BUILD_POLL_MS));
	}
	throw new Error(`The ${version} build was not processed within an hour.`);
}

/** Returns the version to submit, or null when this one is already with Apple. */
async function prepareVersion(versions) {
	const same = versions.find((item) => item.attributes.versionString === version);
	if (same && !EDITABLE.has(stateOf(same))) {
		console.log(`${version} is already ${stateOf(same)}. Nothing to submit.`);
		return null;
	}

	const blocking = versions.find(
		(item) => item.attributes.versionString !== version && WITH_APPLE.has(stateOf(item)),
	);
	if (blocking) {
		throw new Error(
			`${blocking.attributes.versionString} is ${stateOf(blocking)}. Apple takes one version at a time, so release or cancel it, then re-run this job.`,
		);
	}

	const existing = same ?? versions.find((item) => EDITABLE.has(stateOf(item)));
	if (!existing) {
		const { data } = await request("POST", "/v1/appStoreVersions", {
			data: {
				type: "appStoreVersions",
				attributes: { platform: "IOS", versionString: version, releaseType: "AFTER_APPROVAL" },
				relationships: { app: { data: { type: "apps", id: appId } } },
			},
		});
		console.log(`Created App Store version ${version}.`);
		return data;
	}

	const { data } = await request("PATCH", `/v1/appStoreVersions/${existing.id}`, {
		data: {
			type: "appStoreVersions",
			id: existing.id,
			attributes: { versionString: version, releaseType: "AFTER_APPROVAL" },
		},
	});
	console.log(`Using App Store version ${version}.`);
	return data;
}

/** Every localization gets the same keywords and, when it applies, the same What's New. */
async function setLocalizations(versionId, withWhatsNew) {
	const { data } = await request(
		"GET",
		`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`,
	);
	const attributes = withWhatsNew ? { keywords, whatsNew } : { keywords };
	for (const localization of data) {
		await request("PATCH", `/v1/appStoreVersionLocalizations/${localization.id}`, {
			data: { type: "appStoreVersionLocalizations", id: localization.id, attributes },
		});
	}
	const what = withWhatsNew ? "keywords and What's New" : "keywords";
	console.log(`Set ${what} on ${data.length} localization(s): ${keywords}`);
}

async function submitForReview(versionId) {
	const query = new URLSearchParams({
		"filter[app]": appId,
		"filter[platform]": "IOS",
		"filter[state]": "READY_FOR_REVIEW,UNRESOLVED_ISSUES",
		limit: "1",
	});
	const open = await request("GET", `/v1/reviewSubmissions?${query}`);
	const submission =
		open.data[0] ??
		(
			await request("POST", "/v1/reviewSubmissions", {
				data: {
					type: "reviewSubmissions",
					attributes: { platform: "IOS" },
					relationships: { app: { data: { type: "apps", id: appId } } },
				},
			})
		).data;

	const items = await request(
		"GET",
		`/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=50`,
	);
	const listed = items.data.some(
		(item) => item.relationships?.appStoreVersion?.data?.id === versionId,
	);
	if (!listed) {
		await request("POST", "/v1/reviewSubmissionItems", {
			data: {
				type: "reviewSubmissionItems",
				relationships: {
					reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
					appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
				},
			},
		});
	}

	await request("PATCH", `/v1/reviewSubmissions/${submission.id}`, {
		data: { type: "reviewSubmissions", id: submission.id, attributes: { submitted: true } },
	});
}

async function main() {
	const { data: versions } = await request(
		"GET",
		`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=200`,
	);

	const target = await prepareVersion(versions);
	if (!target) return;

	const build = await waitForBuild();
	await request("PATCH", `/v1/appStoreVersions/${target.id}/relationships/build`, {
		data: { type: "builds", id: build.id },
	});
	console.log(`Attached build ${build.attributes.version} to ${version}.`);

	// Apple refuses What's New on an app's first version, which has nothing to
	// compare with. Keywords apply to every version, the first one included.
	const hasBeenLive = versions.some((item) => LIVE.has(stateOf(item)));
	if (!hasBeenLive) console.log("No version has been live yet, so What's New does not apply.");
	await setLocalizations(target.id, hasBeenLive);

	await submitForReview(target.id);
	console.log(`${version} is submitted for review and releases automatically once approved.`);
}

main().catch((error) => {
	console.error(`::error::${error.message}`);
	process.exit(1);
});
