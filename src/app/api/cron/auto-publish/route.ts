import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { runAutoPublishCron } from "@/lib/actions/content-generation-actions";

// Generation + analysis + publish takes time per blog. Bump the limit.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutoPublishCron();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Auto-publish cron error:", error);
    const message = error instanceof Error ? error.message : "Auto-publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
