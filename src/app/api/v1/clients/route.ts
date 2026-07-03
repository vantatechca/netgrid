import { NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/api/auth";
import { listPublicClients } from "@/lib/api/public-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/clients
 * List clients with site count, average SEO score, and last-post time.
 * Query params (optional):
 *   ?email=<address>   case-insensitive exact match (resolve a user → client)
 *   ?status=<status>   onboarding | active | paused | churned
 */
export async function GET(request: Request) {
  const denied = await apiAuthGuard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim() || undefined;
  const status = url.searchParams.get("status")?.trim() || undefined;

  try {
    const clients = await listPublicClients({ email, status });
    return NextResponse.json({ clients });
  } catch (err) {
    console.error("[api/v1/clients] failed:", err);
    return NextResponse.json(
      { error: "Failed to load clients" },
      { status: 500 },
    );
  }
}
