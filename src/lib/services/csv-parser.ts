import type { SeoPlugin } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CsvBlogRow {
  domain: string;
  wpUrl: string;
  wpUsername: string;
  wpAppPassword: string;
  seoPlugin: SeoPlugin;
  hostingProvider: string;
  registrar: string;
  domainExpiryDate: string;
  hostingExpiryDate: string;
  postingFrequency: string;
}

export interface BlogInsert {
  clientId: string;
  domain: string;
  wpUrl: string | null;
  wpUsername: string | null;
  wpAppPassword: string | null;
  seoPlugin: SeoPlugin;
  hostingProvider: string | null;
  registrar: string | null;
  domainExpiryDate: string | null;
  hostingExpiryDate: string | null;
  postingFrequency: string | null;
  status: "setup";
}

export interface CsvError {
  row: number;
  field: string;
  message: string;
}

export interface CsvParseResult {
  valid: BlogInsert[];
  errors: CsvError[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPECTED_COLUMNS = [
  "domain",
  "wp_url",
  "wp_username",
  "wp_app_password",
  "seo_plugin",
  "hosting_provider",
  "registrar",
  "domain_expiry_date",
  "hosting_expiry_date",
  "posting_frequency",
] as const;

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const URL_REGEX = /^https?:\/\/.+/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SEO_PLUGINS: SeoPlugin[] = ["yoast", "rankmath", "none"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function validateDomain(value: string): boolean {
  return DOMAIN_REGEX.test(value);
}

function validateUrl(value: string): boolean {
  if (!value) return true; // optional
  return URL_REGEX.test(value);
}

function validateDate(value: string): boolean {
  if (!value) return true; // optional
  if (!DATE_REGEX.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

function validateSeoPlugin(value: string): value is SeoPlugin {
  return VALID_SEO_PLUGINS.includes(value as SeoPlugin);
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into validated blog insert records.
 * Returns valid rows ready for database insertion and any validation errors.
 */
export function parseBlogCsv(csvContent: string, clientId: string): CsvParseResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      valid: [],
      errors: [{ row: 0, field: "file", message: "CSV must have a header row and at least one data row" }],
    };
  }

  // Parse and validate header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());

  const missingColumns = EXPECTED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          field: "header",
          message: `Missing required columns: ${missingColumns.join(", ")}`,
        },
      ],
    };
  }

  // Build column index map
  const colIndex: Record<string, number> = {};
  for (const col of EXPECTED_COLUMNS) {
    colIndex[col] = headers.indexOf(col);
  }

  const valid: BlogInsert[] = [];
  const errors: CsvError[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1; // 1-based, accounting for header
    const fields = parseCSVLine(lines[i]);
    const rowErrors: CsvError[] = [];

    const getValue = (col: string): string => {
      const idx = colIndex[col];
      return idx !== undefined && idx < fields.length ? fields[idx].trim() : "";
    };

    const domain = getValue("domain");
    const wpUrl = getValue("wp_url");
    const wpUsername = getValue("wp_username");
    const wpAppPassword = getValue("wp_app_password");
    const seoPluginRaw = getValue("seo_plugin").toLowerCase() || "none";
    const hostingProvider = getValue("hosting_provider");
    const registrar = getValue("registrar");
    const domainExpiryDate = getValue("domain_expiry_date");
    const hostingExpiryDate = getValue("hosting_expiry_date");
    const postingFrequency = getValue("posting_frequency");

    // Validate domain (required)
    if (!domain) {
      rowErrors.push({ row: rowNum, field: "domain", message: "Domain is required" });
    } else if (!validateDomain(domain)) {
      rowErrors.push({ row: rowNum, field: "domain", message: `Invalid domain format: ${domain}` });
    }

    // Validate wp_url
    if (wpUrl && !validateUrl(wpUrl)) {
      rowErrors.push({ row: rowNum, field: "wp_url", message: `Invalid URL format: ${wpUrl}` });
    }

    // Validate seo_plugin
    if (!validateSeoPlugin(seoPluginRaw)) {
      rowErrors.push({
        row: rowNum,
        field: "seo_plugin",
        message: `Invalid SEO plugin: ${seoPluginRaw}. Must be yoast, rankmath, or none`,
      });
    }

    // Validate dates
    if (domainExpiryDate && !validateDate(domainExpiryDate)) {
      rowErrors.push({
        row: rowNum,
        field: "domain_expiry_date",
        message: `Invalid date format: ${domainExpiryDate}. Use YYYY-MM-DD`,
      });
    }

    if (hostingExpiryDate && !validateDate(hostingExpiryDate)) {
      rowErrors.push({
        row: rowNum,
        field: "hosting_expiry_date",
        message: `Invalid date format: ${hostingExpiryDate}. Use YYYY-MM-DD`,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      valid.push({
        clientId,
        domain,
        wpUrl: wpUrl || null,
        wpUsername: wpUsername || null,
        wpAppPassword: wpAppPassword || null,
        seoPlugin: seoPluginRaw as SeoPlugin,
        hostingProvider: hostingProvider || null,
        registrar: registrar || null,
        domainExpiryDate: domainExpiryDate || null,
        hostingExpiryDate: hostingExpiryDate || null,
        postingFrequency: postingFrequency || null,
        status: "setup",
      });
    }
  }

  return { valid, errors };
}
