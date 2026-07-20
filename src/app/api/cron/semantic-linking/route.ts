import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { runSemanticLinkingBackfill } from "@/lib/services/semantic-linking";

// Embedding + relinking a batch of posts involves per-post OpenAI calls and
// platform API writes, so give it generous headroom. The runner caps how many
// posts it touches per run (default 40) so history drains over several runs.
export const maxDuration = 600;

/**
 * Semantic-linking backfill cron.
 *
 * Embeds published posts that don't yet have a vector, then injects "Related
 * posts" links into posts that haven't been linked. New posts are linked
 * immediately by the publish hook; this covers historical posts and retries
 * earlier failures.
 *
 * GET /api/cron/semantic-linking?limit=40[&blogId=<uuid>]
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const blogId = url.searchParams.get("blogId") ?? undefined;
  const limit = limitParam !== null ? Number(limitParam) : undefined;
  // ?refresh=1 re-links already-linked posts (for a one-off rescore after
  // tuning). The scheduled cron omits it and only does new work.
  const refresh = ["1", "true", "yes"].includes(
    (url.searchParams.get("refresh") ?? "").toLowerCase(),
  );

  try {
    const result = await runSemanticLinkingBackfill({
      limit: Number.isFinite(limit) ? limit : undefined,
      blogId,
      refresh,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Semantic-linking cron error:", error);
    const message =
      error instanceof Error ? error.message : "Semantic linking failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
