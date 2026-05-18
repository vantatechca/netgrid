import axios, { type AxiosInstance, type AxiosError } from "axios";
import type {
  WpConnectionResult,
  SeoPlugin,
  PublishPostInput,
  PublishPostResult,
} from "@/lib/types";
import { compressImageDataUri } from "./image-compress";

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
  const baseURL = normalizeWpUrl(wpUrl);
  const endpoint = `${baseURL}/wp-json/wp/v2/users/me`;
  const authHeader = createBasicAuth(username, appPassword);

  console.log("[wp.testConnection] GET", endpoint, {
    username,
    pwLen: appPassword.length,
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      redirect: "follow",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    console.log("[wp.testConnection] network error:", msg);
    return { success: false, message: `Cannot reach WordPress: ${msg}` };
  }

  console.log("[wp.testConnection] response", {
    status: response.status,
    finalUrl: response.url,
    server: response.headers.get("server"),
  });

  if (!response.ok) {
    let body = "";
    try { body = await response.text(); } catch {}
    console.log("[wp.testConnection] error body:", body.slice(0, 500));

    let wpCode: string | undefined;
    let wpMessage: string | undefined;
    try {
      const parsed = JSON.parse(body) as { code?: string; message?: string };
      wpCode = parsed.code;
      wpMessage = parsed.message;
    } catch {}

    if (response.status === 401 || response.status === 403) {
      if (wpCode) {
        return { success: false, message: `${wpCode}: ${wpMessage || "Authentication failed"}` };
      }
      return {
        success: false,
        message: "Authentication failed. Verify username, application password, and that your host does not strip the Authorization header.",
      };
    }
    if (response.status === 404) {
      return { success: false, message: "WordPress REST API endpoint not found. Ensure WP REST API is enabled." };
    }
    return { success: false, message: wpMessage || `WordPress returned HTTP ${response.status}` };
  }

  const user = (await response.json()) as WpUser;
  const userRole = user.roles?.[0] || "unknown";

  const wpVersion =
    response.headers.get("x-wp-version") ||
    response.headers.get("x-powered-by") ||
    undefined;

  let seoPlugin: SeoPlugin = "none";
  try {
    const client = createClient(wpUrl, username, appPassword);
    await client.get("/wp-json/yoast/v1/get_head", { params: { url: baseURL }, timeout: 5000 });
    seoPlugin = "yoast";
  } catch {
    try {
      const client = createClient(wpUrl, username, appPassword);
      await client.get("/wp-json/rankmath/v1/getHead", { params: { url: baseURL }, timeout: 5000 });
      seoPlugin = "rankmath";
    } catch {}
  }

  console.log("[wp.testConnection] success", { user: user.name, role: userRole });

  return {
    success: true,
    message: `Connected as ${user.name} (${userRole})`,
    wpVersion: wpVersion || undefined,
    seoPlugin,
    userRole,
  };
}


/**
 * Create a new WordPress post. If `input.featuredImageUrl` is set, the image
 * is uploaded to the Media Library first and its ID is attached as
 * `featured_media`.
 */
export async function createPost(
  wpUrl: string,
  username: string,
  appPassword: string,
  input: PublishPostInput,
): Promise<PublishPostResult> {
  try {
    const client = createClient(wpUrl, username, appPassword);

    // Upload the featured image up-front (best-effort — if it fails we still
    // publish the post, just without a featured image).
    let featuredMediaId: number | undefined;
    if (input.featuredImageUrl) {
      try {
        const uploaded = await uploadMediaFromUrl(
          wpUrl,
          username,
          appPassword,
          input.featuredImageUrl,
          { filename: input.title, altText: input.title },
        );
        featuredMediaId = uploaded.id;
      } catch (err) {
        console.warn(
          "[wp.createPost] featured image upload failed, continuing without it:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Rewrite any <img src="data:image/..."> in the body to WP Media
    // Library URLs (or strip on upload failure). Keeps the post payload
    // small enough that shared hosts with PHP post_max_size = 2M don't
    // reject the request — and avoids embedding huge base64 into the
    // editor where it would slow Gutenberg / Classic editor loads.
    const rewrittenBody = await rewriteBodyDataUrisToWpUrls(
      wpUrl,
      username,
      appPassword,
      input.content,
      input.title,
    );

    const wpStatus = (input.status ?? "publish") === "publish" ? "publish" : "draft";
    const res = await client.post<WpPost>("/wp-json/wp/v2/posts", {
      title: input.title,
      content: rewrittenBody,
      excerpt: input.excerpt,
      status: wpStatus,
      ...(featuredMediaId !== undefined && { featured_media: featuredMediaId }),
    });

    return {
      success: true,
      message: `Post "${res.data.title.rendered}" ${
        wpStatus === "publish" ? "published" : "saved as draft"
      }${featuredMediaId ? " with featured image" : ""}`,
      postId: res.data.id,
      postUrl: res.data.link,
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}

/**
 * Download an image from a public URL and upload it to the WordPress Media
 * Library. Returns the new media row. The caller can pass `id` to the post's
 * `featured_media` field.
 *
 * Requires the authenticated user to have the `upload_files` capability
 * (admins/editors do by default; authors do; contributors do NOT).
 */
export async function uploadMediaFromUrl(
  wpUrl: string,
  username: string,
  appPassword: string,
  imageUrl: string,
  options: { filename?: string; altText?: string; caption?: string } = {},
): Promise<{ id: number; sourceUrl: string }> {
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  // 1. Resolve image bytes — either decode a data: URI inline (Imagen output
  //    without Bunny re-host) or fetch the URL.
  let buffer: Buffer;
  let contentType: string;

  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;,]+)(;base64)?,(.+)$/);
    if (!match) {
      throw new Error("Malformed data URI for featured image");
    }
    contentType = match[1].toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw new Error(`data: URI is not an image (${contentType})`);
    }
    buffer = match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]), "binary");
  } else {
    const imageRes = await fetch(imageUrl, { redirect: "follow" });
    if (!imageRes.ok) {
      throw new Error(`Failed to download image (${imageRes.status}) from ${imageUrl}`);
    }
    const arrayBuffer = await imageRes.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    contentType = imageRes.headers.get("content-type") || "image/jpeg";
  }

  const ext = extMap[contentType] || contentType.split("/")[1] || "jpg";
  const safeFilename = (options.filename || `hero-${Date.now()}`)
    .replace(/[^a-z0-9._-]/gi, "-")
    .slice(0, 80);
  const filename = safeFilename.endsWith(`.${ext}`) ? safeFilename : `${safeFilename}.${ext}`;

  // 2. POST the binary to /wp/v2/media
  const client = createClient(wpUrl, username, appPassword);
  const uploadRes = await client.post<{ id: number; source_url: string }>(
    "/wp-json/wp/v2/media",
    buffer,
    {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    },
  );

  // 3. Set alt text / caption on the uploaded media (optional)
  if (options.altText || options.caption) {
    try {
      await client.post(`/wp-json/wp/v2/media/${uploadRes.data.id}`, {
        ...(options.altText && { alt_text: options.altText }),
        ...(options.caption && { caption: options.caption }),
      });
    } catch {
      // Metadata update failure is non-fatal — the image itself uploaded fine.
    }
  }

  return { id: uploadRes.data.id, sourceUrl: uploadRes.data.source_url };
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
 * Fetch posts with pagination + full content. Returns the page of posts plus
 * the total counts from WordPress's response headers.
 */
export async function fetchPosts(
  wpUrl: string,
  username: string,
  appPassword: string,
  options: {
    page?: number;
    perPage?: number;
    /** WP statuses to include. Authenticated requests default to publish only;
     *  pass ["publish","draft","pending","private","future"] to see all. */
    statuses?: string[];
    search?: string;
  } = {},
): Promise<{ posts: WpPost[]; total: number; totalPages: number }> {
  const { page = 1, perPage = 20, statuses, search } = options;
  const client = createClient(wpUrl, username, appPassword);

  const params: Record<string, string | number> = {
    page,
    per_page: perPage,
    orderby: "date",
    order: "desc",
    context: "edit",
    _fields:
      "id,date,date_gmt,modified,slug,status,title,content,excerpt,link,featured_media,categories,tags",
  };
  if (statuses && statuses.length > 0) params.status = statuses.join(",");
  if (search) params.search = search;

  const res = await client.get<WpPost[]>("/wp-json/wp/v2/posts", {
    params,
    validateStatus: () => true,
  });

  // WP returns 400 if `page` is past the last page — return empty rather than
  // throw, since "page 2 of an empty list" is a reasonable thing to ask.
  if (res.status === 400) {
    return { posts: [], total: 0, totalPages: 0 };
  }
  if (res.status >= 400) {
    throw new Error(formatError({ response: res, isAxiosError: true } as never));
  }

  const total = parseInt((res.headers?.["x-wp-total"] as string | undefined) ?? "0", 10);
  const totalPages = parseInt(
    (res.headers?.["x-wp-totalpages"] as string | undefined) ?? "0",
    10,
  );

  return { posts: res.data, total, totalPages };
}

/**
 * Delete a WordPress post. By default sends to trash; pass force=true to skip
 * trash and delete permanently.
 */
export async function deletePost(
  wpUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  force: boolean = false,
): Promise<{ deleted: boolean; permanently: boolean }> {
  const client = createClient(wpUrl, username, appPassword);
  const res = await client.delete<{ deleted?: boolean; previous?: WpPost } | WpPost>(
    `/wp-json/wp/v2/posts/${postId}`,
    { params: force ? { force: true } : {} },
  );
  // Trash response: the post itself with status=trash. Force response:
  // { deleted: true, previous: WpPost }.
  if (force) {
    const data = res.data as { deleted?: boolean };
    return { deleted: Boolean(data.deleted), permanently: true };
  }
  return { deleted: true, permanently: false };
}

export async function findPostByUrl(
  wpUrl: string,
  username: string,
  appPassword: string,
  pageUrl: string,
): Promise<WpPost | null> {
  let slug = "";
  try {
    const u = new URL(pageUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    slug = parts[parts.length - 1] || "";
  } catch {
    return null;
  }
  if (!slug) return null;

  const client = createClient(wpUrl, username, appPassword);
  const res = await client.get<WpPost[]>("/wp-json/wp/v2/posts", {
    params: { slug, per_page: 1, _fields: "id,slug,title,content,excerpt,link,status" },
    validateStatus: () => true,
  });

  if (res.status >= 400 || !Array.isArray(res.data)) return null;
  return res.data[0] ?? null;
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

// ─── Validation & Diagnostics ───────────────────────────────────────────────

export interface AppPasswordValidation {
  isValid: boolean;
  format: "WordPress Application Password" | "Unknown format";
  issues: string[];
}

/**
 * Validate the format of a WordPress Application Password.
 * Real app passwords are 24 alphanumeric characters split into 6 groups of 4
 * separated by single spaces — 29 characters total.
 */
export function validateApplicationPassword(password: string): AppPasswordValidation {
  const issues: string[] = [];
  const wpFormat = /^[a-zA-Z0-9]{4} [a-zA-Z0-9]{4} [a-zA-Z0-9]{4} [a-zA-Z0-9]{4} [a-zA-Z0-9]{4} [a-zA-Z0-9]{4}$/;

  if (password.length !== 29) {
    issues.push(`Length should be 29 characters, got ${password.length}`);
  }
  if (!wpFormat.test(password)) {
    issues.push("Does not match WordPress Application Password format (xxxx xxxx xxxx xxxx xxxx xxxx)");
  }
  if (!/^[a-zA-Z0-9 ]+$/.test(password)) {
    issues.push("Contains invalid characters (only alphanumeric and spaces allowed)");
  }

  return {
    isValid: issues.length === 0,
    format: wpFormat.test(password) ? "WordPress Application Password" : "Unknown format",
    issues,
  };
}

export interface DiagnosticResult {
  restApiAvailable: boolean;
  authenticationWorking: boolean;
  userInfo?: WpUser;
  errors: string[];
  recommendations: string[];
}

/**
 * Rich diagnostic test that separates REST-API availability from authentication,
 * and surfaces actionable recommendations per failure mode.
 */
export async function diagnosticTest(
  wpUrl: string,
  username: string,
  appPassword: string,
): Promise<DiagnosticResult> {
  const errors: string[] = [];
  const recommendations: string[] = [];
  let restApiAvailable = false;
  let authenticationWorking = false;
  let userInfo: WpUser | undefined;

  const baseURL = normalizeWpUrl(wpUrl);

  // 1. REST API availability (unauthenticated probe)
  try {
    const res = await axios.get(`${baseURL}/wp-json/wp/v2/`, {
      timeout: WP_TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300) {
      restApiAvailable = true;
    } else {
      errors.push(`REST API not available: HTTP ${res.status}`);
      recommendations.push("Enable the WordPress REST API or check if a security plugin is blocking /wp-json/");
    }
  } catch (err) {
    errors.push(`Network error reaching REST API: ${err instanceof Error ? err.message : "unknown"}`);
    recommendations.push("Check that the WordPress URL is correct and the site is publicly reachable");
  }

  // 2. Authentication probe
  try {
    const client = createClient(wpUrl, username, appPassword);
    const res = await client.get<WpUser>("/wp-json/wp/v2/users/me", {
      validateStatus: () => true,
    });

    if (res.status >= 200 && res.status < 300) {
      authenticationWorking = true;
      userInfo = res.data;
    } else {
      switch (res.status) {
        case 401:
          errors.push("Authentication failed — invalid username or Application Password");
          recommendations.push("Verify the WordPress username is correct");
          recommendations.push("Regenerate the Application Password and copy it exactly (including spaces)");
          recommendations.push("Confirm the Application Password has not been revoked");
          recommendations.push('If on Dreamhost, add to .htaccess: SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1');
          break;
        case 403:
          errors.push("Authenticated but the user lacks permissions");
          recommendations.push("Ensure the WordPress user has the edit_posts or publish_posts capability");
          break;
        case 404:
          errors.push("WordPress REST API endpoint /wp/v2/users/me not found");
          recommendations.push("Update WordPress and confirm the REST API is enabled");
          break;
        default:
          errors.push(`Unexpected authentication response: HTTP ${res.status}`);
          recommendations.push("Check WordPress error logs for details");
      }
    }

    const server = (res.headers?.server as string | undefined)?.toLowerCase();
    if (server?.includes("litespeed")) {
      recommendations.push("LiteSpeed server detected — review LiteSpeed Cache REST API exclusions");
    }
    const platform = (res.headers?.platform as string | undefined)?.toLowerCase();
    if (platform === "hostinger") {
      recommendations.push("Hostinger hosting detected — check their security rules for external API access");
    }
  } catch (err) {
    errors.push(`Authentication probe error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return { restApiAvailable, authenticationWorking, userInfo, errors, recommendations };
}

export interface PublishPermissionsResult {
  canPublish: boolean;
  roles: string[];
  message: string;
}

/**
 * Verify the authenticated user has a role that allows publishing.
 */
export async function verifyPublishPermissions(
  wpUrl: string,
  username: string,
  appPassword: string,
): Promise<PublishPermissionsResult> {
  try {
    const client = createClient(wpUrl, username, appPassword);
    const res = await client.get<WpUser>("/wp-json/wp/v2/users/me", {
      params: { context: "edit" },
    });
    const roles = res.data.roles ?? [];
    const canPublish = roles.some((r) =>
      ["administrator", "editor", "author"].includes(r),
    );
    return {
      canPublish,
      roles,
      message: canPublish
        ? "User has publishing permissions"
        : `User roles (${roles.join(", ") || "none"}) do not include publishing permissions`,
    };
  } catch (error) {
    return {
      canPublish: false,
      roles: [],
      message: formatError(error),
    };
  }
}

/**
 * Create a throwaway draft post to confirm the publish pipeline works end-to-end.
 */
export async function createTestDraft(
  wpUrl: string,
  username: string,
  appPassword: string,
): Promise<{ success: boolean; postId?: number; message: string }> {
  const result = await createPost(wpUrl, username, appPassword, {
    title: "Test Draft — Netgrid Connection Check",
    content: "<p>Automated test draft created by Netgrid to verify publishing. Safe to delete.</p>",
    excerpt: "Automated connection test draft.",
    status: "draft",
  });
  if (!result.success) {
    return { success: false, message: result.message };
  }
  return {
    success: true,
    postId: typeof result.postId === "number" ? result.postId : undefined,
    message: `Test draft created (ID: ${result.postId})`,
  };
}

/**
 * Walk post body for <img src="data:image/...">, upload each to the WP
 * Media Library, and swap the src for the returned source_url. If any
 * upload fails, that <img> is stripped entirely so the post body stays
 * lean.
 */
async function rewriteBodyDataUrisToWpUrls(
  wpUrl: string,
  username: string,
  appPassword: string,
  body: string,
  postTitle: string,
): Promise<string> {
  const imgRegex =
    /<img\s+([^>]*?)src=(['"])(data:image\/[^'"]+)\2([^>]*)>/gi;
  const matches: Array<{ full: string; before: string; uri: string; after: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = imgRegex.exec(body)) !== null) {
    matches.push({ full: m[0], before: m[1], uri: m[3], after: m[4] });
  }
  if (matches.length === 0) return body;

  console.info(
    `[wp-media] Found ${matches.length} data: URI image(s) in body, uploading…`,
  );

  let rewritten = body;
  for (const match of matches) {
    try {
      const uploaded = await uploadMediaFromUrl(
        wpUrl,
        username,
        appPassword,
        match.uri,
        { filename: `body-${Date.now()}`, altText: postTitle },
      );
      const replacement = `<img ${match.before}src="${uploaded.sourceUrl}"${match.after}>`;
      rewritten = rewritten.replace(match.full, replacement);
      console.info(`[wp-media] Uploaded → ${uploaded.sourceUrl}`);
      continue;
    } catch (err) {
      console.warn(
        "[wp-media] Body image upload failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // Upload failed (often because the user lacks upload_files capability
    // — contributors don't have it, only authors/editors/admins do).
    // Try to inline a compressed JPEG so the post still has the image.
    const compressed = await compressImageDataUri(match.uri, {
      maxBytes: 500 * 1024,
      maxWidth: 1024,
      quality: 72,
    });
    if (compressed) {
      const replacement = `<img ${match.before}src="${compressed}"${match.after}>`;
      rewritten = rewritten.replace(match.full, replacement);
      console.info(
        `[wp-media] Upload unavailable; inlining compressed JPEG (${Math.round(compressed.length / 1024)} KB)`,
      );
      continue;
    }

    rewritten = rewritten.replace(
      match.full,
      "<!-- body image: upload + compression both failed; stripped -->",
    );
    console.warn(
      "[wp-media] Upload + compression both failed; img stripped from body",
    );
  }

  return rewritten;
}
