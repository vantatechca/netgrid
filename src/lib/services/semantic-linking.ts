// Semantic (cosine-similarity) linking engine.
//
// Embeds each published post's title + body into a pgvector column, then finds
// the most contextually-similar OTHER posts on the SAME blog and links them
// together — an internal-linking SEO win that keyword matching misses.
//
// Links are applied two ways (per product decision):
//   1. A "Related posts" block injected into the live post body (works on any
//      WordPress or Shopify theme, no theme edits needed).
//   2. A custom.netgrid_related_posts JSON metafield on Shopify (for themes /
//      tooling that want the structured list).
//
// Everything here is best-effort: callers (publish hook, cron, webhook) invoke
// it fire-and-forget and it never throws into their path.

import { db } from "@/lib/db";
import { blogs, generatedPosts } from "@/lib/db/schema";
import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import * as platform from "@/lib/services/platform-client";
import type { PlatformBlog } from "@/lib/services/platform-client";
import {
  embeddingsConfigured,
  getEmbeddingProvider,
} from "@/lib/services/embeddings-client";

// ─── Config (env-overridable) ────────────────────────────────────────────────

// Hybrid score = alpha * sparse(full-text) + (1 - alpha) * dense(cosine).
// A candidate must exceed `threshold` on that blended 0-1 score to be linked.
// Note the threshold lives on the *hybrid* scale (default 0.55), which is a
// different distribution from a pure-cosine cutoff.

/** Minimum blended hybrid score a candidate must exceed to be linked. */
function threshold(): number {
  const v = Number(process.env.SEMANTIC_LINK_THRESHOLD);
  return Number.isFinite(v) && v > 0 && v < 1 ? v : 0.55;
}

/** Weight on the sparse (full-text) signal; dense gets (1 - alpha). */
function alpha(): number {
  const v = Number(process.env.SEMANTIC_LINK_ALPHA);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.3;
}

/** Max related posts to link per article. */
function maxLinks(): number {
  const v = Number(process.env.SEMANTIC_LINK_MAX);
  return Number.isFinite(v) && v >= 1 ? Math.min(Math.floor(v), 10) : 5;
}

/** Delay between posts in the backfill link loop, to be gentle on platform APIs. */
const LINK_THROTTLE_MS = (() => {
  const v = Number(process.env.SEMANTIC_LINK_THROTTLE_MS);
  return Number.isFinite(v) && v >= 0 ? v : 150;
})();

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

const BLOCK_START = "<!-- netgrid-related-start -->";
const BLOCK_END = "<!-- netgrid-related-end -->";

export interface RelatedPost {
  id: string;
  title: string;
  url: string;
  similarity?: number;
}

// ─── Text sanitization ───────────────────────────────────────────────────────

/**
 * Strip HTML to plain text suitable for the embedding model. Removes script/
 * style, tags, and decodes the handful of entities our content actually emits.
 * Title is prepended so short posts still embed with topical signal.
 */
export function sanitizeForEmbedding(
  title: string | null,
  html: string | null,
): string {
  const text = (html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return [title?.trim(), text].filter(Boolean).join(". ");
}

/**
 * Stringify an error including any axios HTTP response body — the raw
 * "Request failed with status code 400" message hides Shopify's actual reason
 * (invalid_client, bad API key, "exceeded ... rate limit", etc.), which is what
 * we need to tell a config problem from throttling.
 */
function errDetail(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  const resp = (err as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (resp?.data != null) {
    const body =
      typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
    return `${base} — ${body.slice(0, 300)}`;
  }
  return base;
}

// ─── HTML helpers ────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRelatedBlock(related: RelatedPost[]): string {
  const items = related
    .map(
      (r) =>
        `<li><a href="${escapeHtml(r.url)}">${escapeHtml(r.title)}</a></li>`,
    )
    .join("");
  return (
    `${BLOCK_START}\n` +
    `<div class="netgrid-related-posts" data-netgrid="related-posts">\n` +
    `<h3>Related posts</h3>\n<ul>${items}</ul>\n</div>\n` +
    `${BLOCK_END}`
  );
}

/** Remove any previously-injected related block so re-links replace, not stack. */
function stripRelatedBlock(html: string): string {
  const re = new RegExp(
    `\\s*${escapeRegex(BLOCK_START)}[\\s\\S]*?${escapeRegex(BLOCK_END)}\\s*`,
    "g",
  );
  return html.replace(re, "").replace(/\s+$/, "");
}

// ─── Embedding ───────────────────────────────────────────────────────────────

export interface EmbedResult {
  ok: boolean;
  reason?: string;
}

/**
 * Embed a single generated post (by id) and store the vector. No-op-with-reason
 * if embeddings aren't configured or the post has no body yet.
 *
 * `override` lets callers (e.g. the Shopify webhook) embed from freshly-edited
 * live content instead of the stored body.
 */
export async function embedPost(
  postId: string,
  override?: { title?: string | null; body?: string | null },
): Promise<EmbedResult> {
  if (!embeddingsConfigured()) {
    return { ok: false, reason: "OPENAI_API_KEY not configured" };
  }
  const [post] = await db
    .select({
      id: generatedPosts.id,
      title: generatedPosts.title,
      body: generatedPosts.body,
    })
    .from(generatedPosts)
    .where(eq(generatedPosts.id, postId))
    .limit(1);

  if (!post) return { ok: false, reason: "Post not found" };

  const title = override?.title !== undefined ? override.title : post.title;
  // A live edit may include our injected related block — strip it so it
  // doesn't pollute the topical embedding.
  const rawBody =
    override?.body !== undefined ? override.body : post.body;
  const body = rawBody ? stripRelatedBlock(rawBody) : rawBody;
  if (!body) return { ok: false, reason: "Post has no body to embed" };

  const text = sanitizeForEmbedding(title, body);
  if (!text) return { ok: false, reason: "Nothing to embed after sanitize" };

  try {
    const provider = getEmbeddingProvider();
    const [vector] = await provider.embed([text]);
    await db
      .update(generatedPosts)
      .set({
        embedding: vector,
        embeddingModel: provider.model,
        embeddedAt: new Date(),
        // Sparse half of the hybrid score: full-text vector over the same
        // sanitized text. Set here so dense + sparse always stay in sync.
        searchTsv: sql`to_tsvector('english', ${text})`,
        updatedAt: new Date(),
      })
      .where(eq(generatedPosts.id, postId));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Embedding failed",
    };
  }
}

// ─── Hybrid similarity search (dense cosine + sparse full-text) ───────────────

/**
 * Build the full-text query string for the sparse signal from the target
 * post's title + keywords (kept tight so ranking keys on real topic terms, not
 * every word in a long body).
 */
function buildQueryText(title: string | null, keywords: unknown): string {
  const kw = Array.isArray(keywords)
    ? keywords.filter((k): k is string => typeof k === "string" && k.trim() !== "")
    : [];
  return [title ?? "", ...kw].join(" ").trim();
}

/**
 * Find posts on the SAME blog most related to the given post using a HYBRID
 * score: dense cosine similarity (pgvector) blended with the normalized sparse
 * full-text rank (Postgres FTS, our TF-IDF equivalent).
 *
 *   score = alpha * sparseNorm + (1 - alpha) * dense
 *
 * Scoped to published posts with a live URL and an embedding, excluding the
 * post itself. Candidates' raw dense + sparse scores are computed in SQL (no
 * vectors shipped to JS); sparse is min-maxed and blended in JS, then filtered
 * by the hybrid threshold and truncated to maxLinks.
 */
export async function findRelated(postId: string): Promise<RelatedPost[]> {
  const [post] = await db
    .select({
      blogId: generatedPosts.blogId,
      title: generatedPosts.title,
      keywords: generatedPosts.keywords,
    })
    .from(generatedPosts)
    .where(eq(generatedPosts.id, postId))
    .limit(1);
  if (!post) return [];

  const targetEmbedding = sql`(select ${generatedPosts.embedding} from ${generatedPosts} where ${generatedPosts.id} = ${postId})`;
  const queryText = buildQueryText(post.title, post.keywords);
  const tsQuery = sql`websearch_to_tsquery('english', ${queryText})`;

  // Dense (0-1 cosine similarity) and raw sparse (ts_rank) per candidate.
  const dense = sql<number>`1 - (${generatedPosts.embedding} <=> ${targetEmbedding})`;
  const sparse = sql<number>`coalesce(ts_rank(${generatedPosts.searchTsv}, ${tsQuery}), 0)`;

  const rows = await db
    .select({
      id: generatedPosts.id,
      title: generatedPosts.title,
      url: generatedPosts.externalPostUrl,
      dense,
      sparse,
    })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.blogId, post.blogId),
        ne(generatedPosts.id, postId),
        eq(generatedPosts.status, "published"),
        isNotNull(generatedPosts.embedding),
        isNotNull(generatedPosts.externalPostUrl),
      ),
    );

  // Normalize sparse to 0-1 across the candidate set (dense is already 0-1),
  // then blend. Done in JS so the normalization base is the actual candidates.
  const maxSparse = rows.reduce((m, r) => Math.max(m, Number(r.sparse) || 0), 0);
  const a = alpha();
  const th = threshold();

  return rows
    .map((r) => {
      const d = Number(r.dense) || 0;
      const s = maxSparse > 0 ? (Number(r.sparse) || 0) / maxSparse : 0;
      return {
        id: r.id,
        title: r.title,
        url: r.url,
        score: a * s + (1 - a) * d,
      };
    })
    .filter((r) => r.title && r.url && r.score > th)
    .sort((x, y) => y.score - x.score)
    .slice(0, maxLinks())
    .map((r) => ({
      id: r.id,
      title: r.title as string,
      url: r.url as string,
      similarity: r.score,
    }));
}

// ─── Applying links to the live post ─────────────────────────────────────────

export interface ApplyResult {
  ok: boolean;
  count: number;
  changed: boolean;
  reason?: string;
  related?: RelatedPost[];
}

/**
 * Compute related posts for a published article and push the "Related posts"
 * block into its live body (+ Shopify metafield). Idempotent: a stale block is
 * stripped and replaced, and if nothing would change we skip the API write.
 */
export async function applyRelatedLinks(postId: string): Promise<ApplyResult> {
  const [post] = await db
    .select({
      id: generatedPosts.id,
      blogId: generatedPosts.blogId,
      status: generatedPosts.status,
      externalPostId: generatedPosts.externalPostId,
    })
    .from(generatedPosts)
    .where(eq(generatedPosts.id, postId))
    .limit(1);

  if (!post) return { ok: false, count: 0, changed: false, reason: "Not found" };
  if (post.status !== "published" || !post.externalPostId) {
    return { ok: false, count: 0, changed: false, reason: "Post is not live" };
  }

  const related = await findRelated(postId);

  const [blog] = await db
    .select()
    .from(blogs)
    .where(eq(blogs.id, post.blogId))
    .limit(1);
  if (!blog) return { ok: false, count: 0, changed: false, reason: "Blog not found" };

  // Resolve the Shopify blog id ONCE (cached in the client) and reuse it for
  // both the fetch and the update, instead of letting each call re-run a
  // GET /blogs.json — that per-post duplication was tripping Shopify's rate
  // limit during large backfills. No-op for WordPress.
  let shopifyBlogId: string | undefined;
  if ((blog as PlatformBlog).platform === "shopify") {
    try {
      shopifyBlogId = (
        await platform.resolveShopifyBlogId(blog as PlatformBlog)
      )?.blogId;
    } catch (err) {
      return {
        ok: false,
        count: 0,
        changed: false,
        reason: `Blog id resolve failed: ${errDetail(err)}`,
      };
    }
  }

  const { body: liveBody, error: fetchError } =
    await platform.fetchLivePostBodyResult(
      blog as PlatformBlog,
      post.externalPostId,
      shopifyBlogId,
    );
  if (liveBody === null) {
    return {
      ok: false,
      count: 0,
      changed: false,
      reason: fetchError
        ? `Could not fetch live body: ${fetchError}`
        : "Could not fetch live body",
    };
  }

  const stripped = stripRelatedBlock(liveBody);
  const newBody =
    related.length > 0 ? `${stripped}\n${buildRelatedBlock(related)}` : stripped;

  // Nothing to do: no related posts and no stale block to remove.
  if (newBody === liveBody) {
    await db
      .update(generatedPosts)
      .set({
        relatedPosts: related.map(({ id, title, url }) => ({ id, title, url })),
        relatedLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(generatedPosts.id, postId));
    return { ok: true, count: related.length, changed: false, related };
  }

  const relatedJson = JSON.stringify(
    related.map(({ id, title, url }) => ({ id, title, url })),
  );
  const res = await platform.updateLivePostBody(
    blog as PlatformBlog,
    post.externalPostId,
    newBody,
    { relatedPostsJson: relatedJson, shopifyBlogId },
  );

  if (!res.ok) {
    return { ok: false, count: related.length, changed: false, reason: res.message, related };
  }

  await db
    .update(generatedPosts)
    .set({
      relatedPosts: related.map(({ id, title, url }) => ({ id, title, url })),
      relatedLinkedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(generatedPosts.id, postId));

  return { ok: true, count: related.length, changed: true, related };
}

/**
 * Embed a post then (re)link it. Returns the related posts it linked so callers
 * can cascade a one-level relink of neighbours (keeping links bidirectional
 * when a new post joins a blog). Never throws.
 */
export async function relinkGeneratedPost(
  postId: string,
): Promise<{ ok: boolean; related: RelatedPost[]; reason?: string }> {
  try {
    const embedded = await embedPost(postId);
    if (!embedded.ok) return { ok: false, related: [], reason: embedded.reason };
    const applied = await applyRelatedLinks(postId);
    return { ok: applied.ok, related: applied.related ?? [], reason: applied.reason };
  } catch (err) {
    return {
      ok: false,
      related: [],
      reason: err instanceof Error ? err.message : "Relink failed",
    };
  }
}

/**
 * Fire-and-forget relink triggered after a post is published. Relinks the new
 * post AND its top related neighbours one level deep, so the new post appears
 * in their "Related posts" lists too. Bounded by maxLinks; safe to ignore.
 */
export function relinkAfterPublishFireAndForget(postId: string): void {
  void (async () => {
    try {
      const { ok, related } = await relinkGeneratedPost(postId);
      if (!ok) return;
      for (const neighbour of related) {
        // Neighbour already has an embedding; just refresh its links so the
        // new post shows up. Best-effort, serial to avoid API bursts.
        await applyRelatedLinks(neighbour.id).catch(() => undefined);
      }
    } catch {
      // Swallow — linking must never affect the publish path.
    }
  })();
}

// ─── Backfill (cron) ─────────────────────────────────────────────────────────

export interface BackfillError {
  stage: "embed" | "link";
  id: string;
  reason: string;
}

export interface BackfillResult {
  embedded: number;
  embedFailed: number;
  /** Already-embedded posts whose sparse full-text vector was backfilled. */
  tsvBackfilled: number;
  linked: number;
  linkFailed: number;
  /** First few failure reasons (capped), so the cron response is diagnosable. */
  errors?: BackfillError[];
  skipped?: string;
}

// How many failure reasons to surface in the response before truncating.
const MAX_REPORTED_ERRORS = 10;

/**
 * Cron entry point. Embeds published posts that don't yet have a vector, then
 * links published posts that haven't been linked yet. Both passes are capped
 * per run so a large catalogue drains over several runs instead of one giant
 * job. New posts get linked immediately by the publish hook; this backfills
 * history and retries earlier failures.
 */
export async function runSemanticLinkingBackfill(options: {
  limit?: number;
  blogId?: string;
  /**
   * Re-link posts that were already linked (oldest first), instead of only
   * never-linked ones. Use for a one-off refresh after tuning alpha/threshold
   * or after upgrading the scorer. Off by default so the scheduled cron only
   * does new work.
   */
  refresh?: boolean;
} = {}): Promise<BackfillResult> {
  if (!embeddingsConfigured()) {
    return {
      embedded: 0,
      embedFailed: 0,
      tsvBackfilled: 0,
      linked: 0,
      linkFailed: 0,
      skipped: "OPENAI_API_KEY not configured",
    };
  }
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);
  const errors: BackfillError[] = [];
  const record = (stage: "embed" | "link", id: string, reason: string) => {
    console.warn(`[semantic-linking] ${stage} failed for ${id}: ${reason}`);
    if (errors.length < MAX_REPORTED_ERRORS) errors.push({ stage, id, reason });
  };

  // 0. Backfill the sparse full-text vector for posts embedded before the
  //    hybrid layer existed. DB-only (no embedding API call) — sanitize the
  //    stored title+body and set search_tsv so they contribute to the sparse
  //    signal too.
  const toTsv = await db
    .select({
      id: generatedPosts.id,
      title: generatedPosts.title,
      body: generatedPosts.body,
    })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.status, "published"),
        isNotNull(generatedPosts.embedding),
        isNull(generatedPosts.searchTsv),
        isNotNull(generatedPosts.body),
        options.blogId ? eq(generatedPosts.blogId, options.blogId) : undefined,
      ),
    )
    .limit(limit);

  let tsvBackfilled = 0;
  for (const row of toTsv) {
    try {
      const text = sanitizeForEmbedding(row.title, row.body);
      if (!text) continue;
      await db
        .update(generatedPosts)
        .set({ searchTsv: sql`to_tsvector('english', ${text})` })
        .where(eq(generatedPosts.id, row.id));
      tsvBackfilled++;
    } catch (err) {
      record("embed", row.id, err instanceof Error ? err.message : "tsv backfill failed");
    }
  }

  // 1. Embed published posts missing an embedding.
  const toEmbed = await db
    .select({ id: generatedPosts.id })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.status, "published"),
        isNull(generatedPosts.embedding),
        isNotNull(generatedPosts.body),
        options.blogId ? eq(generatedPosts.blogId, options.blogId) : undefined,
      ),
    )
    .limit(limit);

  let embedded = 0;
  let embedFailed = 0;
  for (const row of toEmbed) {
    const res = await embedPost(row.id);
    if (res.ok) embedded++;
    else {
      embedFailed++;
      record("embed", row.id, res.reason ?? "unknown error");
    }
  }

  // 2. Link posts. Default: only never-linked ones. Refresh: re-link
  //    already-linked posts too, oldest-linked first so runs make progress.
  const toLink = await db
    .select({ id: generatedPosts.id })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.status, "published"),
        isNotNull(generatedPosts.embedding),
        isNotNull(generatedPosts.externalPostId),
        options.refresh ? undefined : isNull(generatedPosts.relatedLinkedAt),
        options.blogId ? eq(generatedPosts.blogId, options.blogId) : undefined,
      ),
    )
    .orderBy(sql`${generatedPosts.relatedLinkedAt} asc nulls first`)
    .limit(limit);

  let linked = 0;
  let linkFailed = 0;
  for (const row of toLink) {
    try {
      const res = await applyRelatedLinks(row.id);
      if (res.ok) linked++;
      else {
        linkFailed++;
        record("link", row.id, res.reason ?? "unknown error");
      }
    } catch (err) {
      // A platform API throwing (e.g. axios 4xx) must not abort the whole
      // run — record it and move on to the next post.
      linkFailed++;
      record("link", row.id, errDetail(err));
    }
    // Gentle throttle so a batch doesn't burst the platform's rate limit.
    await sleep(LINK_THROTTLE_MS);
  }

  return {
    embedded,
    embedFailed,
    tsvBackfilled,
    linked,
    linkFailed,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
