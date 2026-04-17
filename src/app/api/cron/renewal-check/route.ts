import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { scanRenewals } from "@/lib/actions/renewal-actions";

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanRenewals();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Renewal check cron error:", error);
    return NextResponse.json({ error: "Renewal check failed" }, { status: 500 });
  }
}
