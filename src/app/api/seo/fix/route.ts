import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { dismissIssue } from "@/lib/actions/seo-actions";
import {
  autoFixIssue,
  autoFixIssuesForScan,
  rescanBlogScore,
} from "@/lib/services/seo-autofix";
import { db } from "@/lib/db";
import { seoIssues } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    issueId?: string;
    action?: string;
    blogId?: string;
    clientId?: string;
    rescan?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { issueId, action, blogId, clientId } = body;
  // Default rescan=true for both apply and applyAll so the SEO score updates
  // immediately. Caller can pass rescan=false to skip (faster but stale score).
  const rescan = body.rescan !== false;

  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  try {
    switch (action) {
      case "apply": {
        if (!issueId) {
          return NextResponse.json({ error: "Missing issueId" }, { status: 400 });
        }
        const result = await autoFixIssue(issueId);

        // Look up the issue's blogId so we can rescan the right one
        let scoreUpdate: Awaited<ReturnType<typeof rescanBlogScore>> | null = null;
        if (rescan && result.applied) {
          const [issueRow] = await db
            .select({ blogId: seoIssues.blogId })
            .from(seoIssues)
            .where(eq(seoIssues.id, issueId))
            .limit(1);
          if (issueRow) {
            scoreUpdate = await rescanBlogScore(issueRow.blogId);
          }
        }
        return NextResponse.json({ ...result, score: scoreUpdate });
      }

      case "applyAll": {
        const conditions = [
          inArray(seoIssues.status, ["detected", "queued"]),
          eq(seoIssues.autoFixable, true),
        ];
        if (blogId) conditions.push(eq(seoIssues.blogId, blogId));
        if (clientId) conditions.push(eq(seoIssues.clientId, clientId));

        const queue = await db
          .select({ id: seoIssues.id, blogId: seoIssues.blogId })
          .from(seoIssues)
          .where(and(...conditions))
          .limit(50);

        const result = await autoFixIssuesForScan(
          queue.map((i) => i.id),
          50,
        );

        // Rescan each blog whose issues we just touched (deduped) — gives the
        // user immediate score feedback for every affected blog.
        const scoreUpdates: Array<{
          blogId: string;
          previousScore: number | null;
          newScore: number | null;
          delta: number | null;
          error?: string;
        }> = [];
        if (rescan && result.applied > 0) {
          const uniqueBlogIds = [...new Set(queue.map((q) => q.blogId))];
          for (const id of uniqueBlogIds) {
            const update = await rescanBlogScore(id);
            scoreUpdates.push({ blogId: id, ...update });
          }
        }

        return NextResponse.json({ ...result, scoreUpdates });
      }

      case "dismiss": {
        if (!issueId) {
          return NextResponse.json({ error: "Missing issueId" }, { status: 400 });
        }
        await dismissIssue(issueId);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("/api/seo/fix error:", err);
    const message = err instanceof Error ? err.message : "Operation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}