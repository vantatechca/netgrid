/**
 * Parser for the operator-provided "homepage SEO bulk import" CSV — a
 * one-off, hand-authored export (brand/region/country + homepage meta
 * title/description per domain), not a general-purpose CSV format. Fields
 * can contain commas and periods inside quotes (real copy, not just single
 * words), so this hand-rolls a small RFC4180-ish parser rather than doing a
 * naive comma split.
 *
 * Expected header (case-insensitive, column order doesn't matter):
 *   domain, brand name, region / province / state, Country Code,
 *   Homepage Meta Title, Homepage Meta Description
 */

export interface HomepageSeoCsvRow {
  domain: string;
  brandName: string;
  region: string;
  countryCode: string;
  metaTitle: string;
  metaDescription: string;
}

export interface HomepageSeoCsvError {
  /** 1-indexed with the header as row 1; 0 for file-level issues. */
  row: number;
  message: string;
}

export interface HomepageSeoCsvParseResult {
  rows: HomepageSeoCsvRow[];
  errors: HomepageSeoCsvError[];
}

const EXPECTED_COLUMNS = {
  domain: "domain",
  brandName: "brand name",
  region: "region / province / state",
  countryCode: "country code",
  metaTitle: "homepage meta title",
  metaDescription: "homepage meta description",
} as const;

/** RFC4180-ish: quoted fields, "" for an embedded quote, commas/newlines inside quotes. */
function parseCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const text = content.replace(/^﻿/, ""); // strip BOM

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      record.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function parseHomepageSeoCsv(content: string): HomepageSeoCsvParseResult {
  const allRecords = parseCsvRecords(content).filter(
    (r) => !(r.length === 1 && r[0].trim() === ""),
  );
  const errors: HomepageSeoCsvError[] = [];

  if (allRecords.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "Empty file" }] };
  }

  const header = allRecords[0].map((h) => h.trim().toLowerCase());
  const colIndex: Partial<Record<keyof typeof EXPECTED_COLUMNS, number>> = {};
  for (const [key, label] of Object.entries(EXPECTED_COLUMNS)) {
    colIndex[key as keyof typeof EXPECTED_COLUMNS] = header.indexOf(label);
  }

  const missing = Object.entries(colIndex)
    .filter(([, idx]) => idx === -1)
    .map(([key]) => EXPECTED_COLUMNS[key as keyof typeof EXPECTED_COLUMNS]);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `Missing expected column(s): ${missing.join(", ")}. Header found: ${allRecords[0].join(" | ")}`,
        },
      ],
    };
  }

  const rawRows: HomepageSeoCsvRow[] = [];
  for (let r = 1; r < allRecords.length; r++) {
    const rec = allRecords[r];
    const rowNum = r + 1; // 1-indexed, header counted as row 1
    const cell = (key: keyof typeof EXPECTED_COLUMNS) =>
      (rec[colIndex[key]!] ?? "").trim();

    const domain = cell("domain").toLowerCase();
    const metaTitle = cell("metaTitle");
    const metaDescription = cell("metaDescription");

    if (!domain) {
      errors.push({ row: rowNum, message: "Missing domain — skipped" });
      continue;
    }
    if (!metaTitle && !metaDescription) {
      errors.push({
        row: rowNum,
        message: `${domain}: both meta title and description are empty — skipped`,
      });
      continue;
    }
    if (metaTitle.length > 70) {
      errors.push({
        row: rowNum,
        message: `${domain}: meta title is ${metaTitle.length} chars (max 70) — skipped`,
      });
      continue;
    }
    if (metaDescription.length > 320) {
      errors.push({
        row: rowNum,
        message: `${domain}: meta description is ${metaDescription.length} chars (max 320) — skipped`,
      });
      continue;
    }

    let countryCode = cell("countryCode").toUpperCase();
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      errors.push({
        row: rowNum,
        message: `${domain}: country code "${countryCode}" isn't 2 letters — left blank`,
      });
      countryCode = "";
    }

    rawRows.push({
      domain,
      brandName: cell("brandName"),
      region: cell("region"),
      countryCode,
      metaTitle,
      metaDescription,
    });
  }

  // Dedupe by domain, keeping the first occurrence — a later duplicate row
  // is reported but ignored rather than silently overwriting the first.
  const seen = new Set<string>();
  const rows: HomepageSeoCsvRow[] = [];
  for (const row of rawRows) {
    if (seen.has(row.domain)) {
      errors.push({ row: 0, message: `Duplicate domain in CSV, ignoring repeat: ${row.domain}` });
      continue;
    }
    seen.add(row.domain);
    rows.push(row);
  }

  return { rows, errors };
}
