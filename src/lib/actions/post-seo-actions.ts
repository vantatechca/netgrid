"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, getSession } from "@/lib/auth/helpers";
import {
  runPostSeoScan,
  type ScanPostResult,
} from "@/lib/services/post-seo-runner";

export type { ScanPostResult };

/**
 * Admin-gated manual per-post SEO scan (the "Scan SEO" button). Delegates the
 * actual work to runPostSeoScan, then revalidates the surfaces that show the
 * result. The same core runs automatically after publish via
 * scanPostAfterPublishFireAndForget().
 */
export async function scanGeneratedPost(postId: string): Promise<ScanPostResult> {
  await requireAdmin();
  const session = await getSession();
  const result = await runPostSeoScan(postId, { userId: session?.user?.id });

  if (result.success && result.blogId && result.clientId) {
    revalidatePath(`/blogs/${result.blogId}/posts`);
    revalidatePath(`/seo/clients/${result.clientId}`);
  }

  return result;
}
