import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateSeoFix(params: {
  niche: string;
  blogDomain: string;
  pageUrl: string;
  pageTitle: string;
  pageContentExcerpt: string;
  issueType: string;
  issueDescription: string;
}): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You are an SEO specialist generating fixes for a blog in the ${params.niche} niche.
The blog is: ${params.blogDomain}.
Generate content that is:
- Relevant to the blog's niche and existing content
- SEO-optimized with natural keyword usage
- Unique (not duplicating any existing meta descriptions on the site)
- Within character limits (meta descriptions: 150-160 chars, titles: 50-60 chars)
- Professional and engaging for the target audience
Current page title: ${params.pageTitle}
Current page URL: ${params.pageUrl}
Page content excerpt: ${params.pageContentExcerpt}`,
    messages: [
      {
        role: "user",
        content: `Fix this SEO issue: ${params.issueType}
Description: ${params.issueDescription}
Return ONLY the fix content, nothing else. No explanations, no labels.`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}

export async function generateMonthlyReport(params: {
  clientName: string;
  clientNiche: string;
  periodStart: string;
  periodEnd: string;
  totalBlogs: number;
  avgScore: number;
  prevAvgScore: number;
  trendDirection: string;
  totalPosts: number;
  onSchedule: number;
  issuesFixed: number;
  criticalRemaining: number;
  topBlogDomain?: string;
  topBlogScoreChange?: number;
  concernBlogDomain?: string;
  concernReason?: string;
}): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `You are a professional SEO analyst writing a monthly performance report for a client
who invested in a private blog network to dominate the ${params.clientNiche} niche.
Write in a confident, professional tone. The client is NOT technical — avoid jargon.
Focus on outcomes and trajectory, not technical details.
Use positive framing where possible, but be honest about areas needing improvement.
Structure the report as:
1. Executive Summary (2-3 sentences: overall health, direction, key number)
2. Highlights (top 3 wins this month)
3. Network Health (overall score, trend, comparison to last month)
4. Content Activity (posts published, schedule adherence)
5. Areas of Focus (what we're working on next month)
Keep the entire report under 500 words. Use simple HTML formatting (h3, p, ul, strong).`,
    messages: [
      {
        role: "user",
        content: `Generate the monthly report for ${params.clientName}.
Period: ${params.periodStart} to ${params.periodEnd}
Data:
- Total blogs: ${params.totalBlogs}
- Average SEO score: ${params.avgScore} (last month: ${params.prevAvgScore})
- Trend: ${params.trendDirection}
- Total posts published: ${params.totalPosts}
- Blogs on schedule: ${params.onSchedule} / ${params.totalBlogs}
- Issues fixed this month: ${params.issuesFixed}
- Critical issues remaining: ${params.criticalRemaining}
${params.topBlogDomain ? `- Top improving blog: ${params.topBlogDomain} (+${params.topBlogScoreChange} points)` : ""}
${params.concernBlogDomain ? `- Most concerning blog: ${params.concernBlogDomain} (${params.concernReason})` : ""}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}

export async function generateIssueDescription(params: {
  issueType: string;
  pageUrl: string;
  technicalDetails: string;
}): Promise<{ title: string; description: string; suggestedFix: string }> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Generate a concise SEO issue report in JSON format for:
Issue type: ${params.issueType}
Page URL: ${params.pageUrl}
Technical details: ${params.technicalDetails}

Return ONLY valid JSON with keys: title (short, under 100 chars), description (1-2 sentences explaining why this matters), suggestedFix (1-2 sentences explaining the fix).`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  try {
    return JSON.parse(textBlock?.text || "{}");
  } catch {
    return {
      title: params.issueType,
      description: params.technicalDetails,
      suggestedFix: "Manual review required.",
    };
  }
}
