import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { runPostVerificationCron } from "@/lib/actions/post-verification-actions";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPostVerificationCron();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Post verification cron error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
