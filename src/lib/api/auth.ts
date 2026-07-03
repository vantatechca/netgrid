import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getMarketingApiKey } from "@/lib/settings/app-settings";

/**
 * Server-to-server auth for the public read API (`/api/v1/*`) consumed by the
 * marketing app. A single shared secret — either generated in-app on the
 * Integrations page (stored in app_settings) or set via the MARKETING_API_KEY
 * env var — presented as `Authorization: Bearer <key>` or `X-API-Key: <key>`.
 * The key must stay on the marketing app's SERVER — never ship it to a browser
 * (the API returns client data). No CORS is set, so browsers can't call it
 * directly anyway.
 */

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — guard first (the length check
  // isn't constant-time, but key length isn't the secret).
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function presentedKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const x = request.headers.get("x-api-key");
  if (x) return x.trim();
  return null;
}

/**
 * Returns an error response when the request is unauthenticated / the API isn't
 * configured, or `null` when the caller is authorized and the handler should
 * proceed. Async because the effective key may live in the DB (app_settings).
 */
export async function apiAuthGuard(
  request: Request,
): Promise<NextResponse | null> {
  const expected = await getMarketingApiKey();
  if (!expected) {
    return NextResponse.json(
      {
        error: "API not configured",
        detail: "No marketing API key is set. Generate one under Integrations.",
      },
      { status: 503 },
    );
  }
  const got = presentedKey(request);
  if (!got || !safeEqual(got, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
