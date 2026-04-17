import axios, { type AxiosInstance, type AxiosError } from "axios";
import type { WpConnectionResult, SeoPlugin } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WpPost {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  slug: string;
  status: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  featured_media: number;
  categories: number[];
  tags: number[];
  yoast_head_json?: Record<string, unknown>;
  rank_math_meta?: Record<string, unknown>;
}

export interface WpUser {
  id: number;
  name: string;
  slug: string;
  roles: string[];
  capabilities?: Record<string, boolean>;
}

export interface YoastHeadData {
  title?: string;
  description?: string;
  og_title?: string;
  og_description?: string;
  og_image?: Array<{ url: string }>;
  robots?: Record<string, string>;
  canonical?: string;
  schema?: Record<string, unknown>;
}

export interface RankMathHeadData {
  head: string;
  success: boolean;
}

export interface RankMathMeta {
  rank_math_title?: string;
  rank_math_description?: string;
  rank_math_focus_keyword?: string;
  rank_math_robots?: string[];
  rank_math_canonical_url?: string;
  rank_math_schema_article_type?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const WP_TIMEOUT_MS = 10000;

function createBasicAuth(username: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
}

function createClient(wpUrl: string, username: string, appPassword: string): AxiosInstance {
  const baseURL = wpUrl.replace(/\/+$/, "");
  return axios.create({
    baseURL,
    timeout: WP_TIMEOUT_MS,
    headers: {
      Authorization: createBasicAuth(username, appPassword),
      "Content-Type": "application/json",
    },
  });
}

function normalizeWpUrl(wpUrl: string): string {
  return wpUrl.replace(/\/+$/, "");
}

function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<{ message?: string; code?: string }>;
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const data = axiosErr.response.data;
      if (status === 401 || status === 403) {
        return "Authentication failed. Check WordPress username and application password.";
      }
      if (status === 404) {
        return "WordPress REST API endpoint not found. Ensure WP REST API is enabled.";
      }
      return data?.message || `WordPress returned HTTP ${status}`;
    }
    if (axiosErr.code === "ECONNABORTED") {
      return "Connection timed out. The WordPress site may be unreachable.";
    }
    if (axiosErr.code === "ENOTFOUND" || axiosErr.code === "ECONNREFUSED") {
      return "Cannot reach the WordPress site. Check the URL.";
    }
    return axiosErr.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred";
}

// ─── WordPress REST API Client ──────────────────────────────────────────────

/**
 * Test WordPress REST API connection by fetching the authenticated user.
 */
export async function testConnection(
  wpUrl: string,
  username: string,
  appPassword: string
): Promise<WpConnectionResult> {
  try {
    const client = createClient(wpUrl, username, appPassword);
    const baseURL = normalizeWpUrl(wpUrl);

    // Fetch authenticated user
    const userRes = await client.get<WpUser>("/wp-json/wp/v2/users/me", {
      params: { context: "edit" },
    });

    const user = userRes.data;
    const userRole = user.roles?.[0] || "unknown";

    // Try to detect WP version from response headers
    const wpVersion =
      (userRes.headers?.["x-wp-version"] as string | undefined) ||
      (userRes.headers?.["x-powered-by"] as string | undefined) ||
      undefined;

    // Detect SEO plugin
    let seoPlugin: SeoPlugin = "none";

    try {
      await client.get("/wp-json/yoast/v1/get_head", {
        params: { url: baseURL },
        timeout: 5000,
      });
      seoPlugin = "yoast";
    } catch {
      // Yoast not available, try RankMath
      try {
        await client.get("/wp-json/rankmath/v1/getHead", {
          params: { url: baseURL },
          timeout: 5000,
        });
        seoPlugin = "rankmath";
      } catch {
        // Neither plugin detected
      }
    }

    return {
      success: true,
      message: `Connected as ${user.name} (${userRole})`,
      wpVersion: wpVersion || undefined,
      seoPlugin,
      userRole,
    };
  } catch (error) {
    return {
      success: false,
      message: formatError(error),
    };
  }
}

/**
 * Fetch recent posts from a WordPress site.
 */
export async function fetchRecentPosts(
  wpUrl: string,
  username: string,
  appPassword: string,
  count: number = 5
): Promise<WpPost[]> {
  const client = createClient(wpUrl, username, appPassword);
  const res = await client.get<WpPost[]>("/wp-json/wp/v2/posts", {
    params: {
      per_page: count,
      orderby: "date",
      order: "desc",
      _fields: "id,date,date_gmt,modified,slug,status,title,link,excerpt,featured_media,categories,tags",
    },
  });
  return res.data;
}

/**
 * Update an existing WordPress post.
 */
export async function updatePost(
  wpUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  data: Partial<{
    title: string;
    content: string;
    excerpt: string;
    status: string;
    slug: string;
    meta: Record<string, unknown>;
  }>
): Promise<WpPost> {
  const client = createClient(wpUrl, username, appPassword);
  const res = await client.post<WpPost>(`/wp-json/wp/v2/posts/${postId}`, data);
  return res.data;
}

/**
 * Update alt text for a WordPress media item.
 */
export async function updateMediaAltText(
  wpUrl: string,
  username: string,
  appPassword: string,
  mediaId: number,
  altText: string
): Promise<{ id: number; alt_text: string }> {
  const client = createClient(wpUrl, username, appPassword);
  const res = await client.post(`/wp-json/wp/v2/media/${mediaId}`, {
    alt_text: altText,
  });
  return { id: res.data.id, alt_text: res.data.alt_text };
}

/**
 * Get Yoast SEO metadata for a URL.
 */
export async function getYoastMeta(
  wpUrl: string,
  username: string,
  appPassword: string,
  url: string
): Promise<YoastHeadData> {
  const client = createClient(wpUrl, username, appPassword);
  const res = await client.get<{ json: YoastHeadData }>("/wp-json/yoast/v1/get_head", {
    params: { url },
  });
  return res.data.json;
}

/**
 * Update Yoast SEO metadata on a post.
 */
export async function updateYoastMeta(
  wpUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  meta: {
    yoast_wpseo_title?: string;
    yoast_wpseo_metadesc?: string;
    yoast_wpseo_focuskw?: string;
    yoast_wpseo_canonical?: string;
  }
): Promise<WpPost> {
  const client = createClient(wpUrl, username, appPassword);
  const res = await client.post<WpPost>(`/wp-json/wp/v2/posts/${postId}`, {
    yoast_head_json: meta,
    meta,
  });
  return res.data;
}

/**
 * Get RankMath SEO metadata for a URL.
 */
export async function getRankMathMeta(
  wpUrl: string,
  username: string,
  appPassword: string,
  url: string
): Promise<RankMathHeadData> {
  const client = createClient(wpUrl, username, appPassword);
  const res = await client.get<RankMathHeadData>("/wp-json/rankmath/v1/getHead", {
    params: { url },
  });
  return res.data;
}

/**
 * Update RankMath SEO metadata on a post.
 */
export async function updateRankMathMeta(
  wpUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  meta: RankMathMeta
): Promise<{ success: boolean }> {
  const client = createClient(wpUrl, username, appPassword);
  const res = await client.post<{ success: boolean }>("/wp-json/rankmath/v1/updateMeta", {
    objectID: postId,
    objectType: "post",
    meta,
  });
  return res.data;
}
