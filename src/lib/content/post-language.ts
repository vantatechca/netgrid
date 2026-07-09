import "server-only";
import { db } from "@/lib/db";
import { generatedPosts } from "@/lib/db/schema";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { postLanguageForDomain } from "@/lib/services/content-generator";

/**
 * Resolve the concrete language ("en" | "fr") for the NEXT post on a blog.
 *
 * The client's explicit `languageMode` wins:
 *   "en"    → English
 *   "fr"    → French
 *   "en_fr" → strict alternation per blog — flip the language of the blog's
 *             most recent non-failed post (the first post starts English)
 *   null/unset → the legacy derived rules (niche / TLD / vertical).
 *
 * Callers resolve this ONCE per post and pass the result to BOTH topic
 * ideation and article generation so the title and body share a language, then
 * persist it on the generated_posts row (so the next post can alternate off it).
 */
export async function resolveNextPostLanguage(opts: {
  languageMode: string | null | undefined;
  blogId: string;
  verticalLanguage: "en" | "fr" | "en_fr" | null | undefined;
  domain: string;
  niche: string | null | undefined;
}): Promise<"en" | "fr"> {
  const mode = opts.languageMode;
  if (mode === "en" || mode === "fr") return mode;

  if (mode === "en_fr") {
    // Alternate off the blog's most recent post that actually committed to a
    // language and wasn't a failed attempt, so published posts alternate
    // cleanly even if a generation failed in between.
    const [last] = await db
      .select({ language: generatedPosts.language })
      .from(generatedPosts)
      .where(
        and(
          eq(generatedPosts.blogId, opts.blogId),
          isNotNull(generatedPosts.language),
          ne(generatedPosts.status, "failed"),
        ),
      )
      .orderBy(desc(generatedPosts.createdAt))
      .limit(1);
    if (last?.language === "en") return "fr";
    if (last?.language === "fr") return "en";
    return "en"; // first post on the blog starts English
  }

  // Unset → legacy derived behaviour.
  return postLanguageForDomain(opts.verticalLanguage, opts.domain, opts.niche);
}
