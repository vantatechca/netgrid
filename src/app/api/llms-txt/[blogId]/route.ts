/**
 * Per-blog llms.txt generator.
 *
 * Format follows the proposed llms.txt spec (Jeremy Howard, 2024):
 *
 *   # {Site Name}
 *   > {One-sentence description}
 *
 *   ## Recent posts
 *   - [{title}]({url}): {one-line description from excerpt}
 *
 * No major LLM crawler honours this yet (as of mid-2026) — it's a future
 * hedge, cheap to ship. We expose it centrally here so:
 *   - operators can curl it for any blog without touching per-site infra
 *   - per-platform delivery can fetch + rehost (Shopify Page, WP MU-plugin
 *     extension, or just a CDN proxy)
 *
 * Cache-Control: 1h public — the file changes only when a post publishes,
 * but a stale hour is fine for an LLM crawler hint and we save the DB hit.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogs, clients, generatedPosts } from "@/lib/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ blogId: string }>;
}

const RECENT_POSTS_LIMIT = 30;

function escapeMarkdown(s: string): string {
  // Light markdown-link-safe escaping — only the characters that break a
  // link target / title. Keeps the file human-readable.
  return s.replace(/[\[\]()]/g, (m) => `\\${m}`);
}

function trimLine(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1).trimEnd() + "…";
}

export async function GET(
  _req: Request,
  ctx: RouteContext,
): Promise<NextResponse> {
  const { blogId } = await ctx.params;
  if (!blogId || typeof blogId !== "string") {
    return new NextResponse("blogId required", { status: 400 });
  }

  const [row] = await db
    .select({
      blog: blogs,
      clientNiche: clients.niche,
    })
    .from(blogs)
    .innerJoin(clients, eq(blogs.clientId, clients.id))
    .where(eq(blogs.id, blogId))
    .limit(1);

  if (!row) {
    return new NextResponse("blog not found", { status: 404 });
  }

  const { blog, clientNiche } = row;

  const recent = await db
    .select({
      title: generatedPosts.title,
      url: generatedPosts.externalPostUrl,
      excerpt: generatedPosts.excerpt,
      publishedAt: generatedPosts.publishedAt,
    })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.blogId, blogId),
        eq(generatedPosts.status, "published"),
        isNotNull(generatedPosts.externalPostUrl),
        isNotNull(generatedPosts.title),
      ),
    )
    .orderBy(desc(generatedPosts.publishedAt))
    .limit(RECENT_POSTS_LIMIT);

  // Build the file. Single source of truth for the format so any future
  // tweaks (sub-sections, optional llms-full.txt) start here.
  const siteName = blog.domain;
  const niche = clientNiche?.trim() || "content";
  const tagline = `${siteName} publishes regular articles on ${niche}.`;

  const lines: string[] = [];
  lines.push(`# ${escapeMarkdown(siteName)}`);
  lines.push(`> ${escapeMarkdown(tagline)}`);
  lines.push("");

  if (recent.length > 0) {
    lines.push("## Recent posts");
    for (const p of recent) {
      if (!p.title || !p.url) continue;
      const desc = p.excerpt ? trimLine(p.excerpt, 140) : "";
      const descPart = desc ? `: ${escapeMarkdown(desc)}` : "";
      lines.push(
        `- [${escapeMarkdown(trimLine(p.title, 120))}](${p.url})${descPart}`,
      );
    }
    lines.push("");
  }

  lines.push("## Optional");
  lines.push(
    `- Sitemap: ${blog.platform === "shopify" ? `https://${siteName}/sitemap.xml` : `https://${siteName}/sitemap_index.xml`}`,
  );
  lines.push("");

  const body = lines.join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Public + 1h cache. llms.txt changes only when a post lands, which
      // happens at most a few times a week per blog; 1h is fine.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}