import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Server-to-server auth for the public read API (`/api/v1/*`) consumed by the
 * marketing app. A single shared secret in `MARKETING_API_KEY`, presented as
 * `Authorization: Bearer <key>` or `X-API-Key: <key>`. The key must stay on the
 * marketing app's SERVER — never ship it to a browser (the API returns client
 * data). No CORS is set, so browsers can't call it directly anyway.
 */

export function apiKeyConfigured(): boolean {
  return Boolean(process.env.MARKETING_API_KEY);
}

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

export function verifyApiKey(request: Request): boolean {
  const expected = process.env.MARKETING_API_KEY;
  if (!expected) return false;
  const got = presentedKey(request);
  if (!got) return false;
  return safeEqual(got, expected);
}

/**
 * Returns an error response when the request is unauthenticated / the API isn't
 * configured, or `null` when the caller is authorized and the handler should
 * proceed.
 */
export function apiAuthGuard(request: Request): NextResponse | null {
  if (!apiKeyConfigured()) {
    return NextResponse.json(
      { error: "API not configured", detail: "MARKETING_API_KEY is not set." },
      { status: 503 },
    );
  }
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
