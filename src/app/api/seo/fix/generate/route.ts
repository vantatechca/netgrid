import { NextResponse } from "next/server";
import { generateFixContent } from "@/lib/actions/seo-actions";

export async function POST(request: Request) {
  try {
    const { issueId } = await request.json();
    if (!issueId) {
      return NextResponse.json({ error: "Missing issueId" }, { status: 400 });
    }

    const fixContent = await generateFixContent(issueId);
    return NextResponse.json({ fixContent });
  } catch {
    return NextResponse.json({ error: "Fix generation failed" }, { status: 500 });
  }
}
