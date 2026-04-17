import { NextResponse } from "next/server";
import { approveIssue, dismissIssue, executeApprovedFix } from "@/lib/actions/seo-actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issueId, action } = body;

    if (!issueId || !action) {
      return NextResponse.json({ error: "Missing issueId or action" }, { status: 400 });
    }

    switch (action) {
      case "approve":
        await approveIssue(issueId);
        return NextResponse.json({ success: true });
      case "dismiss":
        await dismissIssue(issueId);
        return NextResponse.json({ success: true });
      case "execute":
        const result = await executeApprovedFix(issueId);
        return NextResponse.json(result);
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
