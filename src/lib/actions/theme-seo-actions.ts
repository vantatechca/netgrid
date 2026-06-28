"use server";

import { db } from "@/lib/db";
import { blogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/helpers";
import { buildShopifyCreds } from "@/lib/services/platform-client";
import {
  injectSeoMetaTags,
  type ThemeSeoResult,
} from "@/lib/services/shopify-theme-client";

/**
 * Install (or update) the netgrid SEO block in a Shopify store's published
 * theme. Idempotent — safe to re-run; replaces the managed block in place.
 *
 * Requires the Shopify app to have the read_themes / write_themes scopes.
 */
export async function applyThemeSeoFix(
  blogId: string,
): Promise<ThemeSeoResult> {
  await requireAdmin();

  const [blog] = await db
    .select()
    .from(blogs)
    .where(eq(blogs.id, blogId))
    .limit(1);

  if (!blog) {
    return { success: false, message: "Blog not found." };
  }
  if (blog.platform !== "shopify") {
    return {
      success: false,
      message: "Theme SEO fixes only apply to Shopify blogs.",
    };
  }

  const built = buildShopifyCreds(blog);
  if (!built.ok) {
    return { success: false, message: built.message };
  }

  return injectSeoMetaTags(built.creds);
}
