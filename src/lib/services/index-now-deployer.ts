/**
 * Auto-deploy the IndexNow key file on the blog's own domain — no manual
 * setup per site. Uses the credentials NetGrid already stores per blog
 * (WP app password / Shopify Admin API token) to put a verifiable key
 * resource on the target host.
 *
 * Both platform helpers are idempotent: they search for an existing
 * deployment first and only create/update when needed. The result URL is
 * cached in process memory by blog id, so steady-state cost is one Map
 * lookup per publish; cold starts pay one search per blog.
 *
 * Failure is non-fatal: the publish has already succeeded by the time
 * deployment runs (step 7), and a missing key file just means the
 * subsequent IndexNow ping returns 403 — logged, not blocking.
 */

import { blogs as blogsTable } from "@/lib/db/schema";
import {
  uploadIndexNowKeyFile,
} from "@/lib/services/wp-client";
import {
  ensureIndexNowKeyPage,
  type ShopifyCreds,
} from "@/lib/services/shopify-client";

type Blog = typeof blogsTable.$inferSelect;

/**
 * Process-memory cache. Values are either:
 *   - string: the keyLocation URL successfully deployed for this blog
 *   - null:   we attempted and it failed — don't retry this process
 *   - (key missing): never attempted — first publish triggers a deploy
 *
 * Render restarts the service periodically; on each cold start we'll
 * re-check via the platform's idempotent search, but no duplicate
 * deployment happens because both helpers find the existing resource.
 */
const keyLocationCache = new Map<string, string | null>();

/**
 * Ensure the IndexNow key file is reachable on this blog's domain, and
 * return the URL to pass as `keyLocation` in the IndexNow ping. Returns
 * null when:
 *   - INDEXNOW_KEY isn't configured (no point deploying)
 *   - the blog lacks platform credentials
 *   - the platform API rejects the deploy attempt
 *
 * Safe to call from the publish hot path: subsequent calls for the same
 * blog hit the cache without any network IO.
 */
export async function ensureIndexNowKeyDeployed(
  blog: Blog,
): Promise<string | null> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) return null;

  const cached = keyLocationCache.get(blog.id);
  if (cached !== undefined) return cached;

  let result: string | null = null;
  try {
    if (blog.platform === "wordpress") {
      result = await deployForWordPress(blog, key);
    } else if (blog.platform === "shopify") {
      result = await deployForShopify(blog, key);
    } else {
      console.warn(
        `[indexnow-deploy] unknown platform "${blog.platform}" for ${blog.domain} — skipping`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[indexnow-deploy] FAILED for ${blog.domain} (${blog.platform}): ${msg.slice(0, 200)}`,
    );
  }

  // Cache both success and failure so we don't hammer the platform API
  // on every publish if the credentials are bad or the API is down. On
  // cache miss after process restart, the idempotent helpers find the
  // existing resource cheaply.
  keyLocationCache.set(blog.id, result);
  if (result) {
    console.info(
      `[indexnow-deploy] ${blog.domain} key file at ${result}`,
    );
  }
  return result;
}

async function deployForWordPress(blog: Blog, key: string): Promise<string | null> {
  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return null;
  }
  return await uploadIndexNowKeyFile(
    blog.wpUrl,
    blog.wpUsername,
    blog.wpAppPassword,
    key,
  );
}

async function deployForShopify(blog: Blog, key: string): Promise<string | null> {
  if (!blog.shopifyStoreUrl) return null;
  // Build ShopifyCreds in the same shape the rest of the codebase uses
  // (mirrors PlatformBlog → shopifyCredsFromBlog conversion).
  const mode = blog.shopifyAuthMode ?? "client_credentials";
  let creds: ShopifyCreds;
  if (mode === "legacy_token") {
    if (!blog.shopifyAdminApiToken) return null;
    creds = {
      mode: "legacy_token",
      storeUrl: blog.shopifyStoreUrl,
      adminToken: blog.shopifyAdminApiToken,
    };
  } else {
    if (!blog.shopifyClientId || !blog.shopifyClientSecret) return null;
    creds = {
      mode: "client_credentials",
      storeUrl: blog.shopifyStoreUrl,
      clientId: blog.shopifyClientId,
      clientSecret: blog.shopifyClientSecret,
    };
  }
  return await ensureIndexNowKeyPage(creds, key);
}

/** Test hook — clear the in-process cache (used by debug endpoints). */
export function _clearIndexNowDeployCache(): void {
  keyLocationCache.clear();
}