import axios from "axios";

interface CachedToken {
  token: string;
  expiresAt: number; // ms epoch
  grantedScopes?: string;
}

// In-memory fallback. Swap readFromStore/writeToStore for Upstash/Redis in prod.
const localCache = new Map<string, CachedToken>();

async function readFromStore(key: string): Promise<CachedToken | null> {
  return localCache.get(key) ?? null;
}

async function writeToStore(key: string, value: CachedToken): Promise<void> {
  localCache.set(key, value);
}

interface FetchTokenInput {
  shop: string; // e.g. "mystore.myshopify.com"
  clientId: string;
  clientSecret: string;
}

const REFRESH_BUFFER_MS = 60_000; // refresh if within 60s of expiry
const DEFAULT_TTL_SEC = 23 * 60 * 60; // 23h fallback if Shopify omits expires_in

export async function getClientCredentialsToken(
  input: FetchTokenInput,
): Promise<{ token: string; grantedScopes?: string }> {
  const cacheKey = `shopify:cc:${input.shop}:${input.clientId}`;
  const cached = await readFromStore(cacheKey);

  if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return { token: cached.token, grantedScopes: cached.grantedScopes };
  }

  const res = await axios.post<{
    access_token: string;
    expires_in?: number;
    scope?: string;
  }>(
    `https://${input.shop}/admin/oauth/access_token`,
    {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "client_credentials",
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    },
  );

  const ttlSec = res.data.expires_in ?? DEFAULT_TTL_SEC;
  const cachedValue: CachedToken = {
    token: res.data.access_token,
    expiresAt: Date.now() + ttlSec * 1000,
    grantedScopes: res.data.scope,
  };
  await writeToStore(cacheKey, cachedValue);

  return { token: cachedValue.token, grantedScopes: cachedValue.grantedScopes };
}

export function invalidateToken(shop: string, clientId: string): void {
  localCache.delete(`shopify:cc:${shop}:${clientId}`);
}