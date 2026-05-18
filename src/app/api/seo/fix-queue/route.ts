import { NextResponse } from "next/server";
import { getFixQueue } from "@/lib/actions/seo-actions";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId") || undefined;
    const queue = await getFixQueue(clientId);
    return NextResponse.json(queue);
  } catch {
    return NextResponse.json({ error: "Failed to fetch fix queue" }, { status: 500 });
  }
}
