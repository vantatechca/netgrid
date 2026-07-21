import type {
  ConnectionResult,
  Platform,
  PublishPostInput,
  PublishPostResult,
  SeoPlugin,
} from "@/lib/types";
import * as wp from "./wp-client";
import * as shopify from "./shopify-client";
import type { ShopifyCreds } from "./shopify-client";

/**
 * Minimal shape of a blog row for the dispatcher. Only credential fields are
 * required; callers can pass a wider blog object.
 */
export interface PlatformBlog {
  platform: Platform | null;

  // WordPress
  wpUrl?: string | null;
  wpUsername?: string | null;
  wpAppPassword?: string | null;
  /** Which SEO plugin (if any) is installed — routes meta title/description. */
  seoPlugin?: SeoPlugin | null;

  // Shopify (both auth modes supported)
  shopifyAuthMode?: "legacy_token" | "client_credentials" | null;
  shopifyStoreUrl?: string | null;
  shopifyAdminApiToken?: string | null;
  shopifyClientId?: string | null;
  shopifyClientSecret?: string | null;
  shopifyBlogHandle?: string | null;
}

export interface RecentPost {
  title: string;
  url: string;
  publishedAt: Date | null;
}

function resolvePlatform(blog: PlatformBlog): Platform {
  return blog.platform ?? "wordpress";
}

/**
 * Build a ShopifyCreds object from a blog row, or return an error message
 * describing what's missing.
 */
export function buildShopifyCreds(
  blog: PlatformBlog,
):
  | { ok: true; creds: ShopifyCreds }
  | { ok: false; message: string } {
  if (!blog.shopifyStoreUrl) {
    return { ok: false, message: "Shopify store URL is not set." };
  }

  const mode = blog.shopifyAuthMode ?? "client_credentials";

  if (mode === "legacy_token") {
    if (!blog.shopifyAdminApiToken) {
      return {
        ok: false,
        message:
          "Shopify Admin API token is missing. Switch to legacy_token mode and set the token, or use Client ID + Client Secret.",
      };
    }
    return {
      ok: true,
      creds: {
        mode: "legacy_token",
        storeUrl: blog.shopifyStoreUrl,
        adminToken: blog.shopifyAdminApiToken,
      },
    };
  }

  // client_credentials
  if (!blog.shopifyClientId || !blog.shopifyClientSecret) {
    return {
      ok: false,
      message:
        "Shopify Client ID and Client Secret are required for Dev Dashboard auth.",
    };
  }
  return {
    ok: true,
    creds: {
      mode: "client_credentials",
      storeUrl: blog.shopifyStoreUrl,
      clientId: blog.shopifyClientId,
      clientSecret: blog.shopifyClientSecret,
    },
  };
}

// ─── testConnection ─────────────────────────────────────────────────────────

export async function testConnection(
  blog: PlatformBlog,
): Promise<ConnectionResult> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    const built = buildShopifyCreds(blog);
    if (!built.ok) {
      return { success: false, platform, message: built.message };
    }
    return shopify.testConnection(built.creds);
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return {
      success: false,
      platform,
      message:
        "WordPress credentials are incomplete. Set URL, username, and application password.",
    };
  }
  return wp.testConnection(blog.wpUrl, blog.wpUsername, blog.wpAppPassword);
}

// ─── fetchRecentPosts ───────────────────────────────────────────────────────

export async function fetchRecentPosts(
  blog: PlatformBlog,
  count: number = 5,
): Promise<RecentPost[]> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    const built = buildShopifyCreds(blog);
    if (!built.ok) return [];

    const articles = await shopify.fetchRecentArticles(
      built.creds,
      undefined,
      undefined,
      count,
    );

    const storeHost = (blog.shopifyStoreUrl ?? "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");

    // Prefer the cached blog handle for nice URLs; fall back to the article handle alone.
    const blogHandle = blog.shopifyBlogHandle?.trim();

    return articles.map((a) => ({
      title: a.title,
      url: blogHandle
        ? `https://${storeHost}/blogs/${blogHandle}/${a.handle}`
        : `https://${storeHost}/blogs/${a.handle}`,
      publishedAt: a.published_at ? new Date(a.published_at) : null,
    }));
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) return [];
  const posts = await wp.fetchRecentPosts(
    blog.wpUrl,
    blog.wpUsername,
    blog.wpAppPassword,
    count,
  );
  return posts.map((p) => ({
    title: p.title?.rendered ?? "",
    url: p.link,
    publishedAt: p.date ? new Date(p.date) : null,
  }));
}

// ─── publishPost ────────────────────────────────────────────────────────────

export async function publishPost(
  blog: PlatformBlog,
  input: PublishPostInput,
): Promise<PublishPostResult> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    const built = buildShopifyCreds(blog);
    if (!built.ok) {
      return { success: false, message: built.message };
    }
    return shopify.createArticle(built.creds, input, {
      blogHandle: blog.shopifyBlogHandle || undefined,
    });
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return { success: false, message: "WordPress credentials are incomplete." };
  }
  return wp.createPost(blog.wpUrl, blog.wpUsername, blog.wpAppPassword, input, {
    seoPlugin: blog.seoPlugin ?? "none",
  });
}

// ─── SEO backfill (retroactively fix already-published posts) ────────────────

/**
 * Resolve the Shopify numeric blog id once, so a backfill loop doesn't hit
 * /blogs.json per post. Returns null for non-Shopify blogs or bad creds.
 */
export async function resolveShopifyBlogId(
  blog: PlatformBlog,
): Promise<{ blogId: string; blogHandle: string } | null> {
  if (resolvePlatform(blog) !== "shopify") return null;
  const built = buildShopifyCreds(blog);
  if (!built.ok) return null;
  return shopify.resolveBlogId(built.creds, blog.shopifyBlogHandle);
}

/**
 * Fetch a published post's LIVE body HTML (with platform media URLs already
 * in place). The backfill reads this, demotes duplicate H1s, and writes it
 * back — avoiding any data: URI re-upload. Returns null on failure.
 */
export async function fetchLivePostBody(
  blog: PlatformBlog,
  externalPostId: string,
  shopifyBlogId?: string,
): Promise<string | null> {
  return (await fetchLivePostBodyResult(blog, externalPostId, shopifyBlogId))
    .body;
}

/**
 * Like fetchLivePostBody, but returns WHY the body couldn't be fetched instead
 * of a bare null — so callers (semantic-linking diagnostics) can tell a deleted
 * article from a missing-scope permission error. `body` is null on any failure.
 */
export async function fetchLivePostBodyResult(
  blog: PlatformBlog,
  externalPostId: string,
  shopifyBlogId?: string,
): Promise<{ body: string | null; error?: string }> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    const built = buildShopifyCreds(blog);
    if (!built.ok) return { body: null, error: built.message };
    const blogId =
      shopifyBlogId ??
      (await shopify.resolveBlogId(built.creds, blog.shopifyBlogHandle))?.blogId;
    if (!blogId) return { body: null, error: "Could not resolve Shopify blog id" };
    const { article, error } = await shopify.getArticleResult(
      built.creds,
      blogId,
      externalPostId,
    );
    return { body: article?.body_html ?? null, error };
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return { body: null, error: "WordPress credentials not configured" };
  }
  try {
    const body = await wp.getPostContentById(
      blog.wpUrl,
      blog.wpUsername,
      blog.wpAppPassword,
      Number(externalPostId),
    );
    return { body };
  } catch (error) {
    return {
      body: null,
      error: error instanceof Error ? error.message : "WordPress fetch failed",
    };
  }
}

/**
 * Push a new body to an already-published post (used by semantic linking to
 * inject/refresh the "Related posts" block). On Shopify it also writes the
 * related posts as a `custom.netgrid_related_posts` JSON metafield so themes
 * and other tooling can read the structured list. Best-effort: returns a
 * result object rather than throwing.
 */
export async function updateLivePostBody(
  blog: PlatformBlog,
  externalPostId: string,
  bodyHtml: string,
  options: { relatedPostsJson?: string; shopifyBlogId?: string } = {},
): Promise<{ ok: boolean; message?: string }> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    const built = buildShopifyCreds(blog);
    if (!built.ok) return { ok: false, message: built.message };
    const blogId =
      options.shopifyBlogId ??
      (await shopify.resolveBlogId(built.creds, blog.shopifyBlogHandle))?.blogId;
    if (!blogId) {
      return { ok: false, message: "Could not resolve Shopify blog id" };
    }
    const extraMetafields = options.relatedPostsJson
      ? [
          {
            namespace: "custom",
            key: "netgrid_related_posts",
            value: options.relatedPostsJson,
            type: "json",
          },
        ]
      : undefined;
    const res = await shopify.updateArticle(built.creds, blogId, externalPostId, {
      bodyHtml,
      blogHandle: blog.shopifyBlogHandle ?? undefined,
      extraMetafields,
    });
    return { ok: res.success, message: res.message };
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return { ok: false, message: "WordPress credentials not configured" };
  }
  try {
    await wp.updatePost(
      blog.wpUrl,
      blog.wpUsername,
      blog.wpAppPassword,
      Number(externalPostId),
      { content: bodyHtml },
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "WordPress update failed",
    };
  }
}

/**
 * Permanently delete a published post from the live platform. WordPress posts
 * are force-deleted (skip trash); Shopify articles are removed outright. Pass a
 * pre-resolved shopifyBlogId to avoid re-resolving per call in a loop.
 */
export async function deletePublishedPost(
  blog: PlatformBlog,
  externalPostId: string,
  shopifyBlogId?: string,
): Promise<{ deleted: boolean; message?: string }> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    const built = buildShopifyCreds(blog);
    if (!built.ok) return { deleted: false, message: built.message };
    const blogId =
      shopifyBlogId ??
      (await shopify.resolveBlogId(built.creds, blog.shopifyBlogHandle))?.blogId;
    if (!blogId) return { deleted: false, message: "Could not resolve Shopify blog id" };
    return shopify.deleteArticle(built.creds, blogId, externalPostId);
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return { deleted: false, message: "WordPress credentials not configured" };
  }
  try {
    const res = await wp.deletePost(
      blog.wpUrl,
      blog.wpUsername,
      blog.wpAppPassword,
      Number(externalPostId),
      true, // force — skip trash, delete permanently
    );
    return { deleted: res.deleted };
  } catch (error) {
    return {
      deleted: false,
      message: error instanceof Error ? error.message : "WordPress delete failed",
    };
  }
}

/**
 * Push SEO fixes to an already-published post: optionally a new body (after
 * H1 demotion) plus the pixel-capped meta title/description. Idempotent on
 * both platforms.
 */
export async function backfillPostSeo(
  blog: PlatformBlog,
  externalPostId: string,
  input: {
    bodyHtml?: string;
    metaTitle?: string;
    metaDescription?: string;
    /** Shopify only — sets the article excerpt (summary_html). Ignored on WP. */
    excerptHtml?: string;
    focusKeyword?: string;
  },
  shopifyBlogId?: string,
): Promise<PublishPostResult> {
  const platform = resolvePlatform(blog);

  if (platform === "shopify") {
    const built = buildShopifyCreds(blog);
    if (!built.ok) return { success: false, message: built.message };
    const resolved = shopifyBlogId
      ? { blogId: shopifyBlogId, blogHandle: blog.shopifyBlogHandle ?? undefined }
      : await shopify.resolveBlogId(built.creds, blog.shopifyBlogHandle);
    if (!resolved) {
      return { success: false, message: "No Shopify blog found to update." };
    }
    return shopify.updateArticle(built.creds, resolved.blogId, externalPostId, {
      bodyHtml: input.bodyHtml,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      excerptHtml: input.excerptHtml,
      blogHandle: resolved.blogHandle ?? undefined,
    });
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return { success: false, message: "WordPress credentials are incomplete." };
  }
  return wp.updatePostSeo(
    blog.wpUrl,
    blog.wpUsername,
    blog.wpAppPassword,
    Number(externalPostId),
    {
      content: input.bodyHtml,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      focusKeyword: input.focusKeyword,
    },
    blog.seoPlugin ?? "none",
  );
}