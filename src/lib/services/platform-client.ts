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
function buildShopifyCreds(
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