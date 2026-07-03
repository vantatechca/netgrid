import { NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** GET /api/v1 — index / self-documenting endpoint list (auth-gated). */
export async function GET(request: Request) {
  const denied = apiAuthGuard(request);
  if (denied) return denied;

  return NextResponse.json({
    name: "netgrid marketing API",
    version: "v1",
    auth: "Authorization: Bearer <MARKETING_API_KEY> — or header X-API-Key: <key>",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/clients",
        description:
          "List clients with blog count, average SEO score and last-post time. Optional ?email= (case-insensitive) and ?status= filters.",
      },
      {
        method: "GET",
        path: "/api/v1/clients/{clientId}",
        description:
          "A single client with its sites (blogs) and per-site SEO scores.",
      },
    ],
  });
}
