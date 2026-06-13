import type { SchemaId, SchemaSpec } from "../types";

/**
 * 4 JSON output schemas. The composer pastes `jsonSpec` verbatim into the
 * skeleton's {schema.json} placeholder so Claude has the exact target shape.
 *
 * All schemas share a common envelope (title, content, excerpt, metaTitle,
 * metaDescription, keywords). The differentiators are inside `content`:
 *
 *   A — Standard article (h2/h3 hierarchy, prose-heavy)
 *   B — Magazine feature (lead callout, sidebars, byline-style block)
 *   C — FAQ-rich (article followed by Q/A block)
 *   D — Listicle-anchored (numbered headings, summary cards)
 */
export const SCHEMAS: Record<SchemaId, SchemaSpec> = {
  1: {
    id: 1,
    code: "A",
    name: "Standard article",
    jsonSpec: `{
  "title":            "string, ≤60 chars, includes primary keyword",
  "content":          "HTML using only tags from the assigned tag set",
  "excerpt":          "150-160 char summary, plain text",
  "metaTitle":        "string, primary keyword first, ~50 chars, ' | ' separator not '-', no brand name",
  "metaDescription":  "string, ~140 chars, primary keyword early, one sentence with a soft call to action",
  "keywords":         ["3-7 keyword strings, no duplicates"]
}`,
  },
  2: {
    id: 2,
    code: "B",
    name: "Magazine feature",
    jsonSpec: `{
  "title":            "string, ≤80 chars, feature-style",
  "deck":             "string, ≤140 chars, subtitle/standfirst",
  "content":          "HTML: opens with a lead callout <p><strong>…</strong></p>, then body. Allowed tags from tag set only.",
  "excerpt":          "150-160 char summary",
  "metaTitle":        "string, primary keyword first, ~50 chars, ' | ' separator not '-', no brand name",
  "metaDescription":  "string, ~140 chars, primary keyword early, one sentence with a soft call to action",
  "keywords":         ["3-7 keywords"]
}`,
  },
  3: {
    id: 3,
    code: "C",
    name: "FAQ-rich",
    jsonSpec: `{
  "title":            "string, ≤60 chars",
  "content":          "HTML body, then a section <h2>Common questions</h2> followed by an <h3>/answer-paragraph pattern.",
  "faq":              [{ "question": "string", "answer": "string, 60-180 words" }],
  "excerpt":          "150-160 char summary",
  "metaTitle":        "string, primary keyword first, ~50 chars, ' | ' separator not '-', no brand name",
  "metaDescription":  "string, ~140 chars, primary keyword early, one sentence with a soft call to action",
  "keywords":         ["3-7 keywords"]
}`,
  },
  4: {
    id: 4,
    code: "D",
    name: "Listicle-anchored",
    jsonSpec: `{
  "title":            "string, ≤60 chars, may begin with a number",
  "intro":            "120-200 word framing paragraph as plain HTML <p>",
  "items":            [{ "heading": "string ≤80 chars", "body": "string, 120-260 words, plain HTML paragraphs/lists" }],
  "content":          "Concatenated full-article HTML (intro + items rendered)",
  "excerpt":          "150-160 char summary",
  "metaTitle":        "string, primary keyword first, ~50 chars, ' | ' separator not '-', no brand name",
  "metaDescription":  "string, ~140 chars, primary keyword early, one sentence with a soft call to action",
  "keywords":         ["3-7 keywords"]
}`,
  },
};

export const SCHEMA_IDS: SchemaId[] = [1, 2, 3, 4];

export function schemaById(id: SchemaId): SchemaSpec {
  return SCHEMAS[id];
}
