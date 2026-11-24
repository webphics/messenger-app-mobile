/**
 * Reads store-listing/app-store-keywords.txt into the comma-separated string
 * App Store Connect stores as a localization's `keywords`.
 *
 * One keyword per line, `#` starts a comment line, blank lines are skipped.
 * Throws rather than trimming to fit, so a list that is too long fails the
 * release job at its first second instead of reaching Apple cut short.
 */

import { readFileSync } from "node:fs";

/** Apple's limit for the whole field, commas included. */
export const KEYWORDS_LIMIT = 100;

/** @param {string} text */
export function parseKeywords(text) {
	const keywords = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));

	if (keywords.length === 0) throw new Error("The keywords file lists no keywords.");

	const seen = new Set();
	for (const keyword of keywords) {
		if (keyword.includes(",")) {
			throw new Error(`"${keyword}" contains a comma. Put each keyword on its own line.`);
		}
		const key = keyword.toLowerCase();
		if (seen.has(key)) throw new Error(`"${keyword}" is listed twice.`);
		seen.add(key);
	}

	const joined = keywords.join(",");
	if (joined.length > KEYWORDS_LIMIT) {
		throw new Error(
			`The keywords are ${joined.length} characters joined with commas. Apple allows ${KEYWORDS_LIMIT}.`,
		);
	}
	return joined;
}

/** @param {string} path */
export function readKeywords(path) {
	return parseKeywords(readFileSync(path, "utf8"));
}
