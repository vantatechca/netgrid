import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { backfillBlogSeo } from "@/lib/actions/seo-backfill-actions";

// Backfilling reads + rewrites live posts one at a time with platform rate
// limits, so give the run generous headroom.
export const maxDuration = 600;

/**
 * Retroactively apply the current SEO rules (pixel-capped meta title/
 * description + single-H1) to a blog's already-published posts.
 *
 * Usage:
 *   /api/cron/seo-backfill?blogId=<uuid>            → fix one blog (live)
 *   /api/cron/seo-backfill?blogId=<uuid>&dryRun=1   → preview only, no writes
 *   /api/cron/seo-backfill?blogId=<uuid>&limit=50   → cap posts this run
 *
 * Guarded by CRON_SECRET. Single-blog scoped on purpose so it can be tested
 * on one blog before any network-wide rollout.
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const blogId = url.searchParams.get("blogId");
  if (!blogId) {
    return NextResponse.json(
      { error: "blogId query parameter is required" },
      { status: 400 },
    );
  }

  const limitParam = url.searchParams.get("limit");
  const dryRun =
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("dryRun") === "true";

  try {
    const result = await backfillBlogSeo(blogId, {
      limit: limitParam !== null ? Number(limitParam) : undefined,
      dryRun,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("SEO backfill error:", error);
    const message = error instanceof Error ? error.message : "Backfill failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
