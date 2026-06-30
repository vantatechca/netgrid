/**
 * lib/services/wp-seo-injector.ts
 *
 * Plugin-INDEPENDENT SEO for WordPress blogs that run NO SEO plugin
 * (seoPlugin = "none"). Without Yoast/RankMath there is no way, through the
 * WordPress REST API alone, to emit a real <meta name="description"> into
 * <head> — core exposes no head-output route and there's no plugin to render
 * one. What we CAN do through the API is edit post content, and Google reads
 * JSON-LD <script type="application/ld+json"> ANYWHERE in the document (head
 * or body). So we inject an idempotent Article-schema block into the post body.
 *
 * That gives plugin-less sites real structured data (headline, description,
 * dates, author, publisher, image) — which they otherwise completely lack —
 * carrying the SEO description we generated.
 *
 * Caveat: WordPress strips <script> from post content for users WITHOUT the
 * `unfiltered_html` capability (single-site admins HAVE it; multisite
 * non-super-admins do NOT). injectArticleSchema re-reads the post after writing
 * and reports whether the block actually persisted, so the caller can surface
 * "your site strips scripts — install a lightweight SEO plugin" instead of
 * claiming a silent success.
 */

import {
  getPostContentById,
  updatePost,
} from "@/lib/services/wp-client";

// Marker comments that fence the managed block so re-runs replace (not stack)
// it. HTML comments survive WP's KSES content filter for all roles.
export const SCHEMA_START = "<!-- netgrid-seo:jsonld:start -->";
export const SCHEMA_END = "<!-- netgrid-seo:jsonld:end -->";

export interface ArticleSchemaInput {
  url: string;
  headline: string;
  description: string;
  datePublished?: string | null;
  dateModified?: string | null;
  authorName?: string | null;
  publisherName?: string | null;
  imageUrl?: string | null;
}

/** Build a schema.org Article object from the post's SEO fields. */
export function buildArticleJsonLd(
  input: ArticleSchemaInput,
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    // Google caps the displayed headline near 110 chars.
    headline: input.headline.slice(0, 110),
    description: input.description,
  };
  if (input.datePublished) jsonLd.datePublished = input.datePublished;
  if (input.dateModified) jsonLd.dateModified = input.dateModified;
  if (input.imageUrl) jsonLd.image = [input.imageUrl];
  if (input.authorName) {
    jsonLd.author = { "@type": "Person", name: input.authorName };
  }
  if (input.publisherName) {
    jsonLd.publisher = { "@type": "Organization", name: input.publisherName };
  }
  return jsonLd;
}

/** Render the fenced, ready-to-embed JSON-LD block. */
export function renderSchemaBlock(jsonLd: Record<string, unknown>): string {
  return (
    `${SCHEMA_START}\n` +
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` +
    `${SCHEMA_END}`
  );
}

/**
 * Insert or replace the managed block in `body`. Idempotent: if a prior block
 * exists between the markers it's swapped in place; otherwise the block is
 * appended. Pure — no I/O — so it's unit-testable.
 */
export function upsertSchemaBlock(body: string, block: string): string {
  const startIdx = body.indexOf(SCHEMA_START);
  const endIdx = body.indexOf(SCHEMA_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = body.slice(0, startIdx);
    const after = body.slice(endIdx + SCHEMA_END.length);
    return `${before}${block}${after}`;
  }
  const trimmed = body.replace(/\s+$/, "");
  return `${trimmed}\n\n${block}\n`;
}

export interface InjectResult {
  ok: boolean;
  /** True when the block was confirmed present after the write. */
  persisted: boolean;
  message: string;
}

/**
 * Fetch the post's raw body, upsert the Article-schema block, write it back,
 * then re-read to confirm the <script> survived WP's content filter.
 */
export async function injectArticleSchema(
  creds: { wpUrl: string; username: string; appPassword: string },
  postId: number,
  input: ArticleSchemaInput,
): Promise<InjectResult> {
  const { wpUrl, username, appPassword } = creds;

  const body = await getPostContentById(wpUrl, username, appPassword, postId);
  if (body === null) {
    return { ok: false, persisted: false, message: "Could not read post body" };
  }

  const block = renderSchemaBlock(buildArticleJsonLd(input));
  const next = upsertSchemaBlock(body, block);

  try {
    await updatePost(wpUrl, username, appPassword, postId, { content: next });
  } catch (err) {
    return {
      ok: false,
      persisted: false,
      message: err instanceof Error ? err.message : "Failed to write post body",
    };
  }

  // Verify the script tag actually persisted — WP silently drops <script> for
  // roles without unfiltered_html (typical on multisite).
  const after = await getPostContentById(wpUrl, username, appPassword, postId);
  const persisted =
    !!after &&
    after.includes(SCHEMA_START) &&
    after.includes("application/ld+json");

  return persisted
    ? { ok: true, persisted: true, message: "Article schema injected into post" }
    : {
        ok: true,
        persisted: false,
        message:
          "Schema written but stripped by WordPress (the account lacks unfiltered_html — common on multisite). Install a lightweight SEO plugin to render meta tags.",
      };
}
