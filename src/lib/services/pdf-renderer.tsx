/**
 * PDF renderer for monthly client reports.
 *
 * Uses @react-pdf/renderer (pure-Node, no Chromium dependency) so the
 * renderer runs in the same serverless Node environment as the rest of
 * the app — no special build step, no Chromium binary on Render.
 *
 * Input shape mirrors the `reports` table row plus the client's name.
 * Output is a Buffer suitable for direct attachment via Resend.
 *
 * Layout is intentionally minimal: title, period, top-line metrics,
 * highlights list, concerns list, and an optional HTML-stripped summary
 * paragraph. No charts (those would require canvas + chrome).
 */

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Font,
} from "@react-pdf/renderer";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReportPdfData {
  clientName: string;
  periodStart: string; // ISO date "YYYY-MM-DD"
  periodEnd: string;
  title: string | null;
  summaryHtml: string | null;
  overallSeoTrend: "improving" | "stable" | "declining" | null;
  avgSeoScore: number | null;
  totalPostsPublished: number | null;
  totalIssuesFixed: number | null;
  blogsOnSchedule: number | null;
  blogsOffSchedule: number | null;
  highlights: unknown; // jsonb — coerced below
  concerns: unknown;
}

// ─── Styling ────────────────────────────────────────────────────────────────

// @react-pdf ships with Helvetica/Times-Roman/Courier built-in. We use the
// defaults to avoid bundling extra font files into the Lambda.
Font.register({
  family: "Helvetica",
  fonts: [{ src: "Helvetica" }, { src: "Helvetica-Bold", fontWeight: 700 }],
});

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#111",
    lineHeight: 1.5,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#111",
    paddingBottom: 12,
    marginBottom: 20,
  },
  brand: {
    fontSize: 9,
    color: "#666",
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  period: {
    fontSize: 10,
    color: "#555",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 18,
    marginBottom: 8,
    color: "#111",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  metric: {
    width: "50%",
    paddingVertical: 6,
    paddingRight: 8,
  },
  metricLabel: {
    fontSize: 9,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 700,
    marginTop: 2,
  },
  paragraph: {
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bullet: {
    width: 12,
  },
  bulletText: {
    flex: 1,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    paddingTop: 8,
    fontSize: 8,
    color: "#888",
    textAlign: "center",
  },
  trendImproving: { color: "#0a7d32" },
  trendStable: { color: "#5a5a5a" },
  trendDeclining: { color: "#a3261a" },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = {
      month: "long",
      day: "numeric",
      year: "numeric",
    };
    return `${s.toLocaleDateString("en-US", opts)} — ${e.toLocaleDateString("en-US", opts)}`;
  } catch {
    return `${start} — ${end}`;
  }
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v : v == null ? "" : String(v)))
    .filter((s) => s.trim().length > 0);
}

function trendStyle(trend: ReportPdfData["overallSeoTrend"]) {
  switch (trend) {
    case "improving":
      return styles.trendImproving;
    case "declining":
      return styles.trendDeclining;
    default:
      return styles.trendStable;
  }
}

function trendLabel(trend: ReportPdfData["overallSeoTrend"]): string {
  switch (trend) {
    case "improving":
      return "Improving";
    case "declining":
      return "Declining";
    case "stable":
      return "Stable";
    default:
      return "—";
  }
}

// ─── Document component ────────────────────────────────────────────────────

interface MonthlyReportDocumentProps {
  data: ReportPdfData;
}

const MonthlyReportDocument: React.FC<MonthlyReportDocumentProps> = ({ data }) => {
  const highlights = toStringArray(data.highlights);
  const concerns = toStringArray(data.concerns);
  const summaryText = stripHtml(data.summaryHtml);
  const generatedAt = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Document
      title={data.title ?? `${data.clientName} Report`}
      author="NETGRID"
      subject={`Performance report for ${data.clientName}`}
    >
      <Page size="LETTER" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>NETGRID</Text>
          <Text style={styles.title}>
            {data.title ?? `${data.clientName} — Performance Report`}
          </Text>
          <Text style={styles.period}>
            {formatPeriod(data.periodStart, data.periodEnd)}
          </Text>
        </View>

        {/* Metrics */}
        <Text style={styles.sectionTitle}>At a Glance</Text>
        <View style={styles.metricGrid}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Posts Published</Text>
            <Text style={styles.metricValue}>
              {data.totalPostsPublished ?? "—"}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Average SEO Score</Text>
            <Text style={styles.metricValue}>{data.avgSeoScore ?? "—"}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>SEO Trend</Text>
            <Text style={[styles.metricValue, trendStyle(data.overallSeoTrend)]}>
              {trendLabel(data.overallSeoTrend)}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Issues Fixed</Text>
            <Text style={styles.metricValue}>
              {data.totalIssuesFixed ?? "—"}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Blogs On Schedule</Text>
            <Text style={styles.metricValue}>
              {data.blogsOnSchedule ?? "—"}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Blogs Off Schedule</Text>
            <Text style={styles.metricValue}>
              {data.blogsOffSchedule ?? "—"}
            </Text>
          </View>
        </View>

        {/* Summary */}
        {summaryText ? (
          <>
            <Text style={styles.sectionTitle}>Summary</Text>
            {summaryText.split(/\n{2,}/).map((para, i) => (
              <Text key={`p-${i}`} style={styles.paragraph}>
                {para}
              </Text>
            ))}
          </>
        ) : null}

        {/* Highlights */}
        {highlights.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Highlights</Text>
            {highlights.map((item, i) => (
              <View key={`h-${i}`} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Concerns */}
        {concerns.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Areas of Concern</Text>
            {concerns.map((item, i) => (
              <View key={`c-${i}`} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Footer */}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Generated ${generatedAt} • NETGRID • Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
};

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Render a monthly report row to a PDF buffer.
 *
 * Throws if the renderer can't produce output. Caller is responsible for
 * deciding whether to swallow + log (cron path) or surface (manual path).
 */
export async function renderReportPdf(data: ReportPdfData): Promise<Buffer> {
  const doc = <MonthlyReportDocument data={data} />;
  const instance = pdf(doc);
  // pdf().toBuffer() returns a stream in newer versions; toBlob() returns a Blob.
  // Use toBuffer when available, otherwise fall back to toBlob → arrayBuffer.
  if (typeof (instance as { toBuffer?: unknown }).toBuffer === "function") {
    const streamOrBuffer = await (instance as {
      toBuffer: () => Promise<Buffer | NodeJS.ReadableStream>;
    }).toBuffer();
    if (Buffer.isBuffer(streamOrBuffer)) return streamOrBuffer;
    // Stream path — collect chunks
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = streamOrBuffer as NodeJS.ReadableStream;
      stream.on("data", (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }
  // Fallback: toBlob → arrayBuffer
  const blob = await (instance as { toBlob: () => Promise<Blob> }).toBlob();
  const arrayBuf = await blob.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Build a safe filename for the attachment.
 * e.g. "Acme_Health_2026-04_report.pdf"
 */
export function reportPdfFilename(data: ReportPdfData): string {
  const safeClient = data.clientName
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40) || "client";
  const period = data.periodStart.slice(0, 7); // "YYYY-MM"
  return `${safeClient}_${period}_report.pdf`;
}
