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
  embeddingModel,
  generateEmbedding,
} from "@/lib/services/embeddings-client";

// ─── Config (env-overridable) ────────────────────────────────────────────────

/** Cosine similarity a candidate must exceed to count as "related". */
function threshold(): number {
  const v = Number(process.env.SEMANTIC_LINK_THRESHOLD);
  return Number.isFinite(v) && v > 0 && v < 1 ? v : 0.75;
}

/** Max related posts to link per article. */
function maxLinks(): number {
  const v = Number(process.env.SEMANTIC_LINK_MAX);
  return Number.isFinite(v) && v >= 1 ? Math.min(Math.floor(v), 10) : 5;
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
    const vector = await generateEmbedding(text);
    await db
      .update(generatedPosts)
      .set({
        embedding: vector,
        embeddingModel: embeddingModel(),
        embeddedAt: new Date(),
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

// ─── Similarity search ───────────────────────────────────────────────────────

/**
 * Find posts on the SAME blog most similar to the given post. Scoped to
 * published posts that have a live URL and an embedding, excluding the post
 * itself, above the configured cosine threshold. The target embedding is read
 * in-SQL via a subquery so we never ship a 1536-float vector through JS.
 */
export async function findRelated(postId: string): Promise<RelatedPost[]> {
  const [post] = await db
    .select({ blogId: generatedPosts.blogId })
    .from(generatedPosts)
    .where(eq(generatedPosts.id, postId))
    .limit(1);
  if (!post) return [];

  const targetEmbedding = sql`(select ${generatedPosts.embedding} from ${generatedPosts} where ${generatedPosts.id} = ${postId})`;
  const similarity = sql<number>`1 - (${generatedPosts.embedding} <=> ${targetEmbedding})`;

  const rows = await db
    .select({
      id: generatedPosts.id,
      title: generatedPosts.title,
      url: generatedPosts.externalPostUrl,
      similarity,
    })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.blogId, post.blogId),
        ne(generatedPosts.id, postId),
        eq(generatedPosts.status, "published"),
        isNotNull(generatedPosts.embedding),
        isNotNull(generatedPosts.externalPostUrl),
        sql`1 - (${generatedPosts.embedding} <=> ${targetEmbedding}) > ${threshold()}`,
      ),
    )
    .orderBy(sql`${generatedPosts.embedding} <=> ${targetEmbedding} asc`)
    .limit(maxLinks());

  return rows
    .filter((r) => r.title && r.url)
    .map((r) => ({
      id: r.id,
      title: r.title as string,
      url: r.url as string,
      similarity: Number(r.similarity),
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

  const liveBody = await platform.fetchLivePostBody(
    blog as PlatformBlog,
    post.externalPostId,
  );
  if (liveBody === null) {
    return { ok: false, count: 0, changed: false, reason: "Could not fetch live body" };
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
    { relatedPostsJson: relatedJson },
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

export interface BackfillResult {
  embedded: number;
  embedFailed: number;
  linked: number;
  linkFailed: number;
  skipped?: string;
}

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
} = {}): Promise<BackfillResult> {
  if (!embeddingsConfigured()) {
    return { embedded: 0, embedFailed: 0, linked: 0, linkFailed: 0, skipped: "OPENAI_API_KEY not configured" };
  }
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);

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
    else embedFailed++;
  }

  // 2. Link published, embedded posts that haven't been linked yet.
  const toLink = await db
    .select({ id: generatedPosts.id })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.status, "published"),
        isNotNull(generatedPosts.embedding),
        isNotNull(generatedPosts.externalPostId),
        isNull(generatedPosts.relatedLinkedAt),
        options.blogId ? eq(generatedPosts.blogId, options.blogId) : undefined,
      ),
    )
    .limit(limit);

  let linked = 0;
  let linkFailed = 0;
  for (const row of toLink) {
    const res = await applyRelatedLinks(row.id);
    if (res.ok) linked++;
    else linkFailed++;
  }

  return { embedded, embedFailed, linked, linkFailed };
}
