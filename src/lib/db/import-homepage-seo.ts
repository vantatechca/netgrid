/**
 * Bulk-import homepage SEO (+ brand name / region / country) from an
 * operator-provided CSV into `blogs`, matched by domain — and, with
 * --apply, push the homepage meta title/description live to Shopify for
 * every matched Shopify blog (the same global.title_tag/description_tag
 * shop metafields the "Save & push to Shopify" button on the blog edit
 * form writes).
 *
 * CSV columns (header, case-insensitive, order doesn't matter):
 *   domain, brand name, region / province / state, Country Code,
 *   Homepage Meta Title, Homepage Meta Description
 *
 * Usage (from project root, DATABASE_URL required — Shopify push needs
 * nothing extra since each blog's own Shopify credentials are already
 * stored in the DB):
 *
 *   npx tsx src/lib/db/import-homepage-seo.ts path/to/file.csv
 *     Dry run — parses the CSV, matches domains against netgrid, and
 *     prints a full report. Writes nothing.
 *
 *   npx tsx src/lib/db/import-homepage-seo.ts path/to/file.csv --apply
 *     Writes brandName/region/countryCode/homepageMetaTitle/
 *     homepageMetaDescription to the DB for every matched blog, then
 *     pushes the homepage meta live to Shopify for matched Shopify blogs.
 *     WordPress blogs are saved to the DB but not pushed (no live path
 *     yet — see docs on Homepage SEO).
 *
 * Always run the dry run first and read the "not found" list — those are
 * CSV domains that don't match any blog in netgrid (typo, or the blog
 * hasn't been added yet), and they're silently skipped, not created.
 */

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { blogs } from "./schema";
import { parseHomepageSeoCsv } from "../services/homepage-seo-csv";
import { buildShopifyCreds } from "../services/platform-client";
import { updateShopSeoMetafields } from "../services/shopify-client";

async function main() {
  const csvPath = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (!csvPath) {
    console.error(
      "Usage: npx tsx src/lib/db/import-homepage-seo.ts <path-to-csv> [--apply]",
    );
    process.exit(1);
  }

  const resolved = path.resolve(csvPath);
  const content = fs.readFileSync(resolved, "utf-8");
  const { rows, errors: parseErrors } = parseHomepageSeoCsv(content);

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
  const matchedByPlatform: Record<string, number> = {};
  const updatedDb: string[] = [];
  const pushedShopify: string[] = [];
  const skippedNonShopify: string[] = [];
  const failedShopify: Array<{ domain: string; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const [blog] = await db
      .select({
        id: blogs.id,
        domain: blogs.domain,
        platform: blogs.platform,
        shopifyAuthMode: blogs.shopifyAuthMode,
        shopifyStoreUrl: blogs.shopifyStoreUrl,
        shopifyAdminApiToken: blogs.shopifyAdminApiToken,
        shopifyClientId: blogs.shopifyClientId,
        shopifyClientSecret: blogs.shopifyClientSecret,
      })
      .from(blogs)
      .where(eq(blogs.domain, row.domain));

    if (!blog) {
      notFound.push(row.domain);
      console.log(`[${i + 1}/${rows.length}] ${row.domain} — NOT FOUND in netgrid`);
      continue;
    }

    const platformLabel = blog.platform ?? "wordpress";
    matchedByPlatform[platformLabel] = (matchedByPlatform[platformLabel] ?? 0) + 1;
    console.log(`[${i + 1}/${rows.length}] ${row.domain} — matched (${platformLabel})`);

    if (!apply) continue;

    await db
      .update(blogs)
      .set({
        brandName: row.brandName || null,
        region: row.region || null,
        countryCode: row.countryCode || null,
        homepageMetaTitle: row.metaTitle || null,
        homepageMetaDescription: row.metaDescription || null,
        updatedAt: new Date(),
      })
      .where(eq(blogs.id, blog.id));
    updatedDb.push(row.domain);

    if (platformLabel !== "shopify") {
      skippedNonShopify.push(row.domain);
      continue;
    }

    const built = buildShopifyCreds(blog);
    if (!built.ok) {
      failedShopify.push({ domain: row.domain, reason: built.message });
      continue;
    }

    try {
      const push = await updateShopSeoMetafields(built.creds, {
        metaTitle: row.metaTitle,
        metaDescription: row.metaDescription,
      });
      if (push.success) {
        pushedShopify.push(row.domain);
      } else {
        failedShopify.push({ domain: row.domain, reason: push.message });
      }
    } catch (err) {
      failedShopify.push({
        domain: row.domain,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("\n─── Summary ───────────────────────────────────────────────");
  console.log(`CSV rows parsed:      ${rows.length}`);
  console.log(`Matched in netgrid:   ${rows.length - notFound.length}`);
  for (const [platform, n] of Object.entries(matchedByPlatform)) {
    console.log(`  ${platform}: ${n}`);
  }
  console.log(`Not found in netgrid: ${notFound.length}`);
  if (notFound.length > 0) {
    console.log(`  ${notFound.join(", ")}`);
  }

  if (!apply) {
    console.log(
      "\nDry run only — nothing was written. Re-run with --apply to write to the DB and push live to Shopify.",
    );
  } else {
    console.log(`\nDB rows updated:        ${updatedDb.length}`);
    console.log(`Pushed live to Shopify: ${pushedShopify.length}`);
    console.log(
      `Non-Shopify (saved to DB only, not pushed): ${skippedNonShopify.length}`,
    );
    if (skippedNonShopify.length > 0) console.log(`  ${skippedNonShopify.join(", ")}`);
    console.log(`Shopify push failures:  ${failedShopify.length}`);
    for (const f of failedShopify) console.log(`  ${f.domain}: ${f.reason}`);
  }

  process.exit(notFound.length > 0 || failedShopify.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("import-homepage-seo failed:", err);
  process.exit(1);
});
