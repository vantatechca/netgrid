import { NextResponse } from "next/server";
import { getFixQueue } from "@/lib/actions/seo-actions";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId") || undefined;
    const blogId = searchParams.get("blogId") || undefined;
    const limitRaw = searchParams.get("limit");
    const limitNum = limitRaw ? Number(limitRaw) : undefined;
    const queue = await getFixQueue(clientId, {
      blogId,
      limit: limitNum !== undefined && Number.isFinite(limitNum) ? limitNum : undefined,
    });
    return NextResponse.json(queue);
  } catch {
    return NextResponse.json({ error: "Failed to fetch fix queue" }, { status: 500 });
  }
}
