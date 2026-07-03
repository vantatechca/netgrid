import { NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/api/auth";
import { getPublicClient, isUuid } from "@/lib/api/public-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/clients/:clientId
 * A single client with its sites (blogs) and per-site SEO scores.
 */
export async function GET(
  request: Request,
  { params }: { params: { clientId: string } },
) {
  const denied = apiAuthGuard(request);
  if (denied) return denied;

  const { clientId } = params;
  if (!isUuid(clientId)) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  try {
    const client = await getPublicClient(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json(client);
  } catch (err) {
    console.error("[api/v1/clients/:id] failed:", err);
    return NextResponse.json(
      { error: "Failed to load client" },
      { status: 500 },
    );
  }
}
