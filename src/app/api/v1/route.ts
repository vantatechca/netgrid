import { NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** GET /api/v1 — index / self-documenting endpoint list (auth-gated). */
export async function GET(request: Request) {
  const denied = await apiAuthGuard(request);
  if (denied) return denied;

  return NextResponse.json({
    name: "netgrid marketing API",
    version: "v1",
    auth: "Authorization: Bearer <MARKETING_API_KEY> — or header X-API-Key: <key>",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/summary",
        description:
          "Network-wide totals: client/site/post counts, total views/clicks, average SEO score.",
      },
      {
        method: "GET",
        path: "/api/v1/clients",
        description:
          "List clients with blog count, average SEO score, last-post time, published-post count and traffic. Optional ?email=, ?status=, and ?days=/?since= (traffic window) filters.",
      },
      {
        method: "GET",
        path: "/api/v1/clients/{clientId}",
        description:
          "A single client with its sites (blogs), per-site SEO scores, traffic, and latest third-party metrics (Ahrefs/Semrush). Optional ?days=/?since= traffic window.",
      },
      {
        method: "GET",
        path: "/api/v1/clients/{clientId}/posts",
        description:
          "Published posts for a client (newest first) with live URL and per-post views/clicks. Optional ?blogId=, ?limit= (1–100), ?offset=.",
      },
      {
        method: "GET",
        path: "/api/v1/clients/{clientId}/traffic",
        description:
          "Views/clicks bucketed over time. Optional ?granularity=day|week, ?blogId=, ?days=/?since=.",
      },
    ],
  });
}
