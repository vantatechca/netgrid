/**
 * Small RFC4180-ish CSV tokenizer shared by the operator bulk-import
 * parsers (homepage SEO, city assignment, …). Handles quoted fields,
 * embedded commas/newlines inside quotes, and "" for an escaped quote —
 * enough for hand-authored exports where fields can contain real copy
 * (commas, periods), not a general-purpose CSV engine.
 */
export function parseCsvRecords(content: string): string[][] {
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
