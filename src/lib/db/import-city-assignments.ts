/**
 * Bulk-import city assignments from an operator-provided CSV into `blogs`,
 * matched by domain — and, with --apply, immediately build each blog's
 * keyword-target ledger (rather than waiting for the weekly refresh-keywords
 * cron to pick it up). Setting a blog's city is the on/off switch for local
 * keyword-targeted content — see docs/local-keyword-content-plan.md.
 *
 * CSV columns (header, case-insensitive, order doesn't matter):
 *   domain, city
 *
 * Usage (from project root, DATABASE_URL required):
 *
 *   npx tsx src/lib/db/import-city-assignments.ts path/to/file.csv
 *     Dry run — parses the CSV, matches domains against netgrid, and
 *     prints a full report (including domains whose city would CHANGE
 *     vs. ones being newly set). Writes nothing.
 *
 *   npx tsx src/lib/db/import-city-assignments.ts path/to/file.csv --apply
 *     Writes `city` to the DB for every matched blog, then builds that
 *     blog's keyword-target ledger from its client's scraped keywords
 *     (a no-op, reported as such, if the client has no active keywords yet
 *     — the weekly cron will pick it up once keywords exist).
 *
 * Always run the dry run first and read the "not found" list — those are
 * CSV domains that don't match any blog in netgrid and are silently
 * skipped, not created.
 */

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { blogs } from "./schema";
import { parseCityAssignmentCsv } from "../services/city-assignment-csv";
import { buildKeywordTargetsForBlogInternal } from "../actions/keyword-target-actions";

async function main() {
  const csvPath = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (!csvPath) {
    console.error(
      "Usage: npx tsx src/lib/db/import-city-assignments.ts <path-to-csv> [--apply]",
    );
    process.exit(1);
  }

  const resolved = path.resolve(csvPath);
  const content = fs.readFileSync(resolved, "utf-8");
  const { rows, errors: parseErrors } = parseCityAssignmentCsv(content);

  console.log(`Parsed ${rows.length} valid row(s) from ${resolved}`);
  if (parseErrors.length > 0) {
    console.log(`\n${parseErrors.length} row(s) skipped during parsing:`);
    for (const e of parseErrors) console.log(`  row ${e.row}: ${e.message}`);
  }
  if (rows.length === 0) {
    console.log("\nNothing to do.");
    process.exit(parseErrors.length > 0 ? 1 : 0);
  }

  if (!apply) {
    console.log(
      "\nDry run — matching against netgrid, nothing will be written.\n",
    );
  }

  const notFound: string[] = [];
  const newlySet: string[] = [];
  const changing: Array<{ domain: string; from: string; to: string }> = [];
  const unchanged: string[] = [];
  let ledgerBuilt = 0;
  let ledgerNoTargets = 0;
  const ledgerFailed: Array<{ domain: string; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [blog] = await db
      .select({ id: blogs.id, domain: blogs.domain, city: blogs.city })
      .from(blogs)
      .where(eq(blogs.domain, row.domain));

    if (!blog) {
      notFound.push(row.domain);
      console.log(`[${i + 1}/${rows.length}] ${row.domain} — NOT FOUND in netgrid`);
      continue;
    }

    if (!blog.city) {
      newlySet.push(row.domain);
    } else if (blog.city !== row.city) {
      changing.push({ domain: row.domain, from: blog.city, to: row.city });
    } else {
      unchanged.push(row.domain);
    }

    console.log(
      `[${i + 1}/${rows.length}] ${row.domain} — matched (city: ${blog.city ?? "(none)"} -> ${row.city})`,
    );

    if (!apply) continue;

    await db
      .update(blogs)
      .set({ city: row.city, updatedAt: new Date() })
      .where(eq(blogs.id, blog.id));

    try {
      const build = await buildKeywordTargetsForBlogInternal(blog.id);
      if (build.upserted > 0) {
        ledgerBuilt++;
        console.log(`    ledger: ${build.message}`);
      } else {
        ledgerNoTargets++;
        console.log(`    ledger: ${build.message}`);
      }
    } catch (err) {
      ledgerFailed.push({
        domain: row.domain,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("\n─── Summary ───────────────────────────────────────────────");
  console.log(`CSV rows parsed:      ${rows.length}`);
  console.log(`Matched in netgrid:   ${rows.length - notFound.length}`);
  console.log(`  newly set (was blank):     ${newlySet.length}`);
  console.log(`  changing (had a city):     ${changing.length}`);
  for (const c of changing) console.log(`    ${c.domain}: "${c.from}" -> "${c.to}"`);
  console.log(`  unchanged (already this city): ${unchanged.length}`);
  console.log(`Not found in netgrid: ${notFound.length}`);
  if (notFound.length > 0) {
    console.log(`  ${notFound.join(", ")}`);
  }

  if (!apply) {
    console.log(
      "\nDry run only — nothing was written. Re-run with --apply to write to the DB and build each blog's keyword-target ledger.",
    );
  } else {
    console.log(`\nLedger built (targets upserted): ${ledgerBuilt}`);
    console.log(`Ledger no-op (no eligible keywords yet): ${ledgerNoTargets}`);
    console.log(`Ledger build failures: ${ledgerFailed.length}`);
    for (const f of ledgerFailed) console.log(`  ${f.domain}: ${f.reason}`);
  }

  process.exit(notFound.length > 0 || ledgerFailed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("import-city-assignments failed:", err);
  process.exit(1);
});
