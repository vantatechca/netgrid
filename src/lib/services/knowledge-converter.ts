import Anthropic from "@anthropic-ai/sdk";
import { compressImageDataUri } from "./image-compress";

/**
 * Knowledge-base file → Markdown converter.
 *
 * Normalises uploaded client documents (spreadsheets, Word docs, PDFs,
 * images, plain text) into a single Markdown representation. Markdown is the
 * canonical form the knowledge base stores and later feeds to Claude during
 * ideation and generation:
 *   - the Claude API cannot ingest .xlsx / .docx natively (only PDF + images),
 *     so Office files MUST be extracted to text before they're usable;
 *   - Markdown is token-efficient and stable, which makes it cacheable when
 *     reused across many posts.
 *
 * Conversion runs ONCE, at upload — never at generation time. Each branch is
 * deterministic and in-process; the only branch that calls Claude is the
 * vision pass for images (and scanned-PDF fallback).
 *
 * Heavy Node-only libraries (xlsx, mammoth, turndown, pdf-parse) are loaded
 * via dynamic import so they stay out of the edge/client bundle and only cost
 * cold-start when actually used.
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Vision model for image / scanned-document text extraction. Defaults to the
// same Sonnet model the rest of the app uses (the previously hardcoded dated
// snapshot isn't provisioned on every account, which silently broke image
// uploads). Overridable via env without a code change.
const VISION_MODEL = process.env.KNOWLEDGE_VISION_MODEL || "claude-sonnet-4-5";

// Claude's vision API rejects images larger than ~5 MB. Our local upload cap
// is 20 MB, so anything between must be downscaled before the request or it
// throws. Leave headroom under 5 MB for the base64 envelope.
const VISION_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

// Below this character count, a "text" extraction (PDF in particular) is
// treated as effectively empty — likely a scanned/image-only document — and
// flagged as low-confidence so the caller can escalate or queue manual review.
const MIN_CONFIDENT_CHARS = 24;

// ─── Types ──────────────────────────────────────────────────────────────────

export type KnowledgeSourceType =
  | "spreadsheet"
  | "csv"
  | "docx"
  | "pdf"
  | "image"
  | "text";

export interface MarkdownConversionResult {
  /** The normalised Markdown body. */
  markdown: string;
  /** Which converter handled the file. */
  sourceType: KnowledgeSourceType;
  /** Length of the produced Markdown, for quick "did we get anything" checks. */
  charCount: number;
  /**
   * True when extraction produced suspiciously little text (e.g. a scanned PDF
   * with no embedded text layer). The Markdown is still returned, but the
   * caller should consider an OCR/vision pass or manual review.
   */
  lowConfidence: boolean;
  /** Non-fatal notes surfaced to the caller (skipped sheets, fallbacks, etc.). */
  warnings: string[];
}

// ─── File-type detection ──────────────────────────────────────────────────────

function ext(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

function detectType(
  contentType: string,
  fileName: string,
): KnowledgeSourceType | null {
  const ct = contentType.toLowerCase();
  const e = ext(fileName);

  if (
    ct.includes("spreadsheetml") ||
    ct === "application/vnd.ms-excel" ||
    e === "xlsx" ||
    e === "xls"
  ) {
    return "spreadsheet";
  }
  if (ct === "text/csv" || e === "csv") return "csv";
  if (
    ct.includes("wordprocessingml") ||
    ct === "application/msword" ||
    e === "docx" ||
    e === "doc"
  ) {
    return "docx";
  }
  if (ct === "application/pdf" || e === "pdf") return "pdf";
  if (ct.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(e)) {
    return "image";
  }
  if (ct.startsWith("text/") || ["txt", "md", "markdown"].includes(e)) {
    return "text";
  }
  return null;
}

// ─── Markdown helpers ─────────────────────────────────────────────────────────

/** Escape pipe characters so a cell value can't break a Markdown table. */
function escapeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/** Build a GitHub-flavoured Markdown table from a matrix of rows. */
function rowsToMarkdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return "";

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  if (width === 0) return "";

  const pad = (r: unknown[]): string[] => {
    const cells = r.map(escapeCell);
    while (cells.length < width) cells.push("");
    return cells;
  };

  const header = pad(rows[0]);
  // Use generic column names if the first row is blank.
  const headerCells = header.map((h, i) => h || `col${i + 1}`);
  const separator = headerCells.map(() => "---");
  const body = rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`);

  return [
    `| ${headerCells.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body,
  ].join("\n");
}

// ─── Per-type converters ──────────────────────────────────────────────────────

/** .xlsx / .xls → one Markdown table per non-empty sheet. */
async function spreadsheetToMarkdown(
  buf: Buffer,
): Promise<{ markdown: string; warnings: string[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const warnings: string[] = [];
  const sections: string[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (rows.length === 0) {
      warnings.push(`Sheet "${name}" was empty and skipped.`);
      continue;
    }
    const table = rowsToMarkdownTable(rows);
    if (table) sections.push(`## ${name}\n\n${table}`);
  }

  return { markdown: sections.join("\n\n"), warnings };
}

/** .csv → a single Markdown table. */
async function csvToMarkdown(buf: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  // SheetJS parses CSV robustly (quoting, embedded commas) — reuse it rather
  // than hand-rolling a second CSV parser.
  const wb = XLSX.read(buf.toString("utf8"), { type: "string", raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  return rowsToMarkdownTable(rows);
}

/** .docx → Markdown (mammoth → HTML, turndown → Markdown). */
async function docxToMarkdown(
  buf: Buffer,
): Promise<{ markdown: string; warnings: string[] }> {
  const mammoth = await import("mammoth");
  const TurndownService = (await import("turndown")).default;

  const { value: html, messages } = await mammoth.convertToHtml({ buffer: buf });
  const warnings = messages
    .filter((m) => m.type === "warning")
    .map((m) => m.message);

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  return { markdown: turndown.turndown(html).trim(), warnings };
}

/** .pdf → extracted text. Returns empty-ish text for scanned PDFs. */
async function pdfToMarkdown(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return (result.text || "").trim();
  } finally {
    await parser.destroy();
  }
}

/** Image → Markdown via a one-time Claude vision pass. */
async function imageToMarkdown(
  buf: Buffer,
  contentType: string,
): Promise<string> {
  let mediaType = normaliseImageMediaType(contentType);
  let data = buf;

  // Downscale oversized images so we stay under Claude's ~5 MB image limit.
  // compressImageDataUri re-encodes to JPEG; Claude downscales to 1568px
  // internally anyway, so capping width there keeps text legible for OCR.
  if (data.length > VISION_IMAGE_MAX_BYTES) {
    const dataUri = `data:${mediaType};base64,${data.toString("base64")}`;
    const compressed = await compressImageDataUri(dataUri, {
      maxBytes: VISION_IMAGE_MAX_BYTES,
      maxWidth: 1568,
      quality: 80,
    });
    const m = compressed?.match(/^data:([^;,]+);base64,(.+)$/);
    if (m) {
      mediaType = "image/jpeg";
      data = Buffer.from(m[2], "base64");
    }
  }

  if (data.length > VISION_IMAGE_MAX_BYTES) {
    throw new Error(
      `Image is too large to transcribe (${(data.length / 1024 / 1024).toFixed(1)} MB after compression; Claude's limit is ~5 MB). Try a smaller or lower-resolution image.`,
    );
  }

  const message = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: data.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Transcribe this image into clean Markdown. Extract ALL visible text verbatim. If it contains a table, reproduce it as a Markdown table. If it is a chart or photo with little text, write a one-line description plus any labels. Output ONLY the Markdown, no preamble.",
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return (textBlock?.text || "").trim();
}

function normaliseImageMediaType(
  contentType: string,
): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "image/png";
  if (ct.includes("webp")) return "image/webp";
  if (ct.includes("gif")) return "image/gif";
  return "image/jpeg";
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Convert an uploaded knowledge-base file to Markdown.
 *
 * @param buf         Raw file bytes.
 * @param contentType MIME type from the upload (best-effort).
 * @param fileName    Original file name (used as an extension fallback).
 * @throws if the file type is unsupported.
 */
export async function convertToMarkdown(
  buf: Buffer,
  contentType: string,
  fileName: string,
): Promise<MarkdownConversionResult> {
  const type = detectType(contentType, fileName);
  if (!type) {
    throw new Error(
      `Unsupported knowledge-base file type: "${contentType}" (${fileName}). Supported: xlsx, csv, docx, pdf, images, and plain text.`,
    );
  }

  let markdown = "";
  const warnings: string[] = [];

  switch (type) {
    case "spreadsheet": {
      const r = await spreadsheetToMarkdown(buf);
      markdown = r.markdown;
      warnings.push(...r.warnings);
      break;
    }
    case "csv":
      markdown = await csvToMarkdown(buf);
      break;
    case "docx": {
      const r = await docxToMarkdown(buf);
      markdown = r.markdown;
      warnings.push(...r.warnings);
      break;
    }
    case "pdf":
      markdown = await pdfToMarkdown(buf);
      break;
    case "image":
      markdown = await imageToMarkdown(buf, contentType);
      break;
    case "text":
      markdown = buf.toString("utf8").trim();
      break;
  }

  // A near-empty extraction from a non-image source usually means a scanned
  // PDF (no text layer) or a malformed file — flag rather than silently pass.
  const lowConfidence =
    type !== "image" && markdown.length < MIN_CONFIDENT_CHARS;
  if (lowConfidence) {
    warnings.push(
      "Extraction produced little or no text — the file may be scanned/image-only and may need an OCR or vision pass.",
    );
  }

  return {
    markdown,
    sourceType: type,
    charCount: markdown.length,
    lowConfidence,
    warnings,
  };
}
