/**
 * Capture a real DataForSEO response into the test fixture.
 *
 * src/lib/services/dataforseo/fixtures/keyword-suggestions.json is currently
 * hand-written from the API documentation, not a real response — no
 * credentials were available while building the client (see
 * docs/dataforseo-keyword-pipeline.md §8 "Verify before coding"). This
 * script is the intended way to fix that: hit the live endpoint once with a
 * trivial, cheap payload and overwrite the fixture with the real envelope.
 *
 * After running this:
 *   1. Re-run `npm test` — parse.test.ts asserts on specific fixture values
 *      (e.g. items[0].keyword === "bpc 157"), so a real response WILL break
 *      those assertions. Update the test expectations to match what came
 *      back, not the other way around.
 *   2. If any field in src/lib/services/dataforseo/types.ts turns out to be
 *      named or shaped differently in the real response, fix the type —
 *      parse.ts's extraction is null-tolerant either way, so nothing
 *      crashes, but tightening the types makes real drift visible at
 *      compile time instead of silently returning null forever.
 *
 * Usage (from project root):
 *   DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... npx tsx scripts/capture-dataforseo-fixtures.ts
 *
 * Cost: one keyword_suggestions call with limit=5 — check current DataForSEO
 * pricing on your dashboard before running if you want to know the exact
 * number; it's a small fraction of a cent per the pricing model described in
 * the plan, but "small fraction of a cent" was never verified live either.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const LOGIN = process.env.DATAFORSEO_LOGIN;
const PASSWORD = process.env.DATAFORSEO_PASSWORD;

const FIXTURE_PATH = join(
  __dirname,
  "..",
  "src/lib/services/dataforseo/fixtures/keyword-suggestions.json",
);

async function main() {
  if (!LOGIN || !PASSWORD) {
    console.error(
      "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must both be set. Run with:\n" +
        "  DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... npx tsx scripts/capture-dataforseo-fixtures.ts",
    );
    process.exit(1);
  }

  const auth = `Basic ${Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64")}`;
  const body = [
    {
      keyword: "bpc 157",
      location_code: 2840, // United States — confirm against /locations before trusting for anything but this capture
      language_code: "en",
      limit: 5,
      offset: 0,
      include_serp_info: false,
    },
  ];

  console.log("Calling POST /v3/dataforseo_labs/google/keyword_suggestions/live ...");
  const res = await fetch(
    "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const json = await res.json();
  console.log(`Envelope status_code: ${json.status_code} (${json.status_message})`);
  const task = json.tasks?.[0];
  console.log(`Task status_code: ${task?.status_code} (${task?.status_message})`);
  console.log(`Cost: $${task?.cost ?? "unknown"}`);
  console.log(`Items returned: ${task?.result?.[0]?.items?.length ?? 0}`);

  writeFileSync(FIXTURE_PATH, JSON.stringify(json, null, 2) + "\n");
  console.log(`\nWrote real response to ${FIXTURE_PATH}`);
  console.log("Now run `npm test` and update parse.test.ts's expectations to match.");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
