"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  getMarketingApiKey,
  getMarketingApiKeySource,
  setMarketingApiKey,
  clearMarketingApiKey,
} from "@/lib/settings/app-settings";

export interface MarketingApiKeyInfo {
  key: string | null;
  /** "stored" = generated in-app; "env" = MARKETING_API_KEY; "none" = unset. */
  source: "stored" | "env" | "none";
}

export async function getMarketingApiKeyInfo(): Promise<MarketingApiKeyInfo> {
  await requireAdmin();
  const [key, source] = await Promise.all([
    getMarketingApiKey(),
    getMarketingApiKeySource(),
  ]);
  return { key, source };
}

/**
 * Generate a fresh 256-bit key and store it (takes effect within ~15s, no
 * redeploy). Rotating invalidates the previous key.
 */
export async function generateMarketingApiKey(): Promise<{
  success: boolean;
  message: string;
  key?: string;
}> {
  await requireAdmin();
  const key = randomBytes(32).toString("hex");
  try {
    await setMarketingApiKey(key);
  } catch (err) {
    return {
      success: false,
      message:
        err instanceof Error
          ? `Failed to save key: ${err.message}`
          : "Failed to save key",
    };
  }
  revalidatePath("/integrations");
  return { success: true, message: "New API key generated", key };
}

/** Clear the stored key (the API then falls back to the env key, if set). */
export async function revokeMarketingApiKey(): Promise<{
  success: boolean;
  message: string;
}> {
  await requireAdmin();
  try {
    await clearMarketingApiKey();
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to clear key",
    };
  }
  revalidatePath("/integrations");
  return {
    success: true,
    message: "Stored key cleared (falls back to the env key if one is set).",
  };
}
