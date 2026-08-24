/**
 * Parser for the operator-provided "city assignment" bulk-import CSV —
 * domain + city only. Setting a blog's city is the on/off switch for local
 * keyword-targeted content (see docs/local-keyword-content-plan.md): once
 * set, the next keyword-target ledger build picks the blog up automatically.
 *
 * Expected header (case-insensitive, column order doesn't matter):
 *   domain, city
 */

import { parseCsvRecords } from "./csv-records";

export interface CityAssignmentCsvRow {
  domain: string;
  city: string;
}

export interface CityAssignmentCsvError {
  /** 1-indexed with the header as row 1; 0 for file-level issues. */
  row: number;
  message: string;
}

export interface CityAssignmentCsvParseResult {
  rows: CityAssignmentCsvRow[];
  errors: CityAssignmentCsvError[];
}

const EXPECTED_COLUMNS = {
  domain: "domain",
  city: "city",
} as const;

/** Matches blogs.city's varchar(120) column limit. */
const CITY_MAX_LENGTH = 120;

export function parseCityAssignmentCsv(content: string): CityAssignmentCsvParseResult {
  const allRecords = parseCsvRecords(content).filter(
    (r) => !(r.length === 1 && r[0].trim() === ""),
  );
  const errors: CityAssignmentCsvError[] = [];

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

  const rawRows: CityAssignmentCsvRow[] = [];
  for (let r = 1; r < allRecords.length; r++) {
    const rec = allRecords[r];
    const rowNum = r + 1; // 1-indexed, header counted as row 1
    const cell = (key: keyof typeof EXPECTED_COLUMNS) =>
      (rec[colIndex[key]!] ?? "").trim();

    const domain = cell("domain").toLowerCase();
    const city = cell("city");

    if (!domain) {
      errors.push({ row: rowNum, message: "Missing domain — skipped" });
      continue;
    }
    if (!city) {
      errors.push({ row: rowNum, message: `${domain}: missing city — skipped` });
      continue;
    }
    if (city.length > CITY_MAX_LENGTH) {
      errors.push({
        row: rowNum,
        message: `${domain}: city is ${city.length} chars (max ${CITY_MAX_LENGTH}) — skipped`,
      });
      continue;
    }

    rawRows.push({ domain, city });
  }

  // Dedupe by domain, keeping the first occurrence.
  const seen = new Set<string>();
  const rows: CityAssignmentCsvRow[] = [];
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
