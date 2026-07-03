"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  getContentModel,
  getFixModel,
  setAppSetting,
  SETTING_KEYS,
  CONTENT_MODEL_LABELS,
  FIX_MODEL_OPTIONS,
  DEFAULT_FIX_MODEL,
  type ContentModel,
} from "@/lib/settings/app-settings";

export interface ModelSettings {
  contentModel: ContentModel;
  fixModel: string;
  deepseekConfigured: boolean;
  anthropicConfigured: boolean;
}

export async function getModelSettings(): Promise<ModelSettings> {
  await requireAdmin();
  const [contentModel, fixModel] = await Promise.all([
    getContentModel(),
    getFixModel(),
  ]);
  return {
    contentModel,
    fixModel,
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

export async function updateModelSettings(input: {
  contentModel: ContentModel;
  fixModel: string;
}): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  if (!(input.contentModel in CONTENT_MODEL_LABELS)) {
    return { success: false, message: "Invalid content model selection" };
  }
  const validFix =
    FIX_MODEL_OPTIONS.some((o) => o.id === input.fixModel) ||
    input.fixModel === DEFAULT_FIX_MODEL;
  if (!validFix) {
    return { success: false, message: "Invalid SEO fix model selection" };
  }

  await setAppSetting(SETTING_KEYS.contentModel, input.contentModel);
  await setAppSetting(SETTING_KEYS.fixModel, input.fixModel);
  revalidatePath("/settings");
  return { success: true, message: "AI model settings saved" };
}
