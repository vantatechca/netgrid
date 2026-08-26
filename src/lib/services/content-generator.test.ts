import { describe, it, expect, vi } from "vitest";

// content-generator imports @/lib/actions/news-actions, a "use server" module
// that transitively pulls in next-auth. Mock it (and the telemetry recorder)
// so the pure parsing helpers can be exercised without that graph.
vi.mock("@/lib/actions/news-actions", () => ({
  takeNewsContextForVertical: vi.fn(),
  formatNewsContextForPrompt: vi.fn(),
  getRecentNewsForVerticalInternal: vi.fn(),
}));
vi.mock("@/lib/services/run-telemetry", () => ({
  recordPipelineError: vi.fn(),
  bumpCounter: vi.fn(),
  bumpProvider: vi.fn(),
}));

const { safeParseClaudeJsonWithTier, safeParseClaudeJson } = await import(
  "./content-generator"
);

/**
 * The tier is what the truncation gate in generateContent keys on. Before T06
 * a "truncation" parse was published as-is: repairTruncatedJson closes the
 * open string and brackets, so the object parses but the body ends
 * mid-sentence. Getting this classification wrong in either direction is
 * expensive — a false "truncation" fails a good article, a missed one
 * publishes a fragment.
 */

const COMPLETE = JSON.stringify({
  title: "A Complete Article",
  content: "<p>First paragraph.</p><p>Second paragraph.</p>",
  excerpt: "Summary.",
});

describe("safeParseClaudeJsonWithTier — clean input", () => {
  it("reports tier 'none' for valid JSON", () => {
    const r = safeParseClaudeJsonWithTier<{ title: string }>(COMPLETE);
    expect(r.tier).toBe("none");
    expect(r.value.title).toBe("A Complete Article");
  });

  it("does not classify a complete document as truncated", () => {
    expect(safeParseClaudeJsonWithTier(COMPLETE).tier).not.toBe("truncation");
  });
});

describe("safeParseClaudeJsonWithTier — repairs that are NOT truncation", () => {
  // NOTE: markdown fences are NOT this function's job — callClaudeOnce and
  // callDeepSeekOnce both run extractJsonObject() before handing text over,
  // so the parser only ever sees a bare object.

  it("repairs smart quotes without claiming truncation", () => {
    const smart = '{\u201Ctitle\u201D:\u201CA Complete Article\u201D}';
    const r = safeParseClaudeJsonWithTier<{ title: string }>(smart);
    expect(r.value.title).toBe("A Complete Article");
    expect(r.tier).not.toBe("truncation");
  });

  it("repairs a trailing comma without claiming truncation", () => {
    const r = safeParseClaudeJsonWithTier<{ a: number }>('{"a":1,}');
    expect(r.value.a).toBe(1);
    expect(r.tier).not.toBe("truncation");
  });

  it("escapes stray attribute quotes without claiming truncation", () => {
    // An unescaped quote inside an HTML attribute — a complete document that
    // needs a lossless repair, not a salvage.
    const raw = '{"content":"<a href="https://x.test">link</a>","title":"T"}';
    const r = safeParseClaudeJsonWithTier<{ title: string }>(raw);
    expect(r.tier).not.toBe("truncation");
    expect(r.value.title).toBe("T");
  });
});

describe("safeParseClaudeJsonWithTier — genuine truncation", () => {
  it("flags a document cut off mid-string", () => {
    // The exact failure mode: the model hit max_tokens partway through the
    // body, so the string and the object are both left open.
    const cut =
      '{"title":"Where to Buy Peptides","content":"<p>The first paragraph is complete.</p><p>The second one stops mid-sen';
    const r = safeParseClaudeJsonWithTier<{ title: string; content: string }>(
      cut,
    );
    expect(r.tier).toBe("truncation");
    // The salvage still yields a readable title — that is its only purpose.
    expect(r.value.title).toBe("Where to Buy Peptides");
  });

  it("flags a document cut off between fields", () => {
    const cut = '{"title":"T","content":"<p>Body.</p>",';
    expect(safeParseClaudeJsonWithTier(cut).tier).toBe("truncation");
  });

  it("flags a truncated nested array", () => {
    const cut = '{"title":"T","keywords":["one","two","thr';
    expect(safeParseClaudeJsonWithTier(cut).tier).toBe("truncation");
  });
});

describe("safeParseClaudeJson — the back-compatible wrapper", () => {
  it("returns the value and drops the tier", () => {
    expect(safeParseClaudeJson<{ title: string }>(COMPLETE).title).toBe(
      "A Complete Article",
    );
  });

  it("still throws on input no tier can rescue", () => {
    expect(() => safeParseClaudeJson("not json at all")).toThrow();
  });

  it("agrees with the tiered parser on the parsed value", () => {
    const a = safeParseClaudeJson<{ title: string }>(COMPLETE);
    const b = safeParseClaudeJsonWithTier<{ title: string }>(COMPLETE).value;
    expect(a).toEqual(b);
  });
});

/**
 * capWordCount becomes a hot path with T06. Until the token budget was fixed
 * the model could not reach the 2000-word band — the 4096 clamp stopped it
 * first — so the trim rarely fired. Now it runs on every long post, and its
 * two old defects stop being theoretical: it counted markup as words (so it
 * trimmed EARLIER than asked), and it closed only <p> (so a trimmed post was
 * indistinguishable from a model truncation in the published HTML).
 */
const { capWordCount, closeOpenTags, countWordsInHtml } = await import(
  "./content-generator"
);

describe("countWordsInHtml", () => {
  it("counts visible words only, not markup", () => {
    expect(countWordsInHtml("<p>one two three</p>")).toBe(3);
    expect(countWordsInHtml("<ul><li>a</li><li>b</li></ul>")).toBe(2);
  });

  it("is zero for markup with no text", () => {
    expect(countWordsInHtml("<p></p><br/>")).toBe(0);
  });
});

describe("capWordCount — counting parity with countWordsInHtml", () => {
  it("does not trim a body already inside the cap", () => {
    const html = "<p>one two three four five</p>";
    expect(capWordCount(html, 5)).toBe(html);
    expect(capWordCount(html, 50)).toBe(html);
  });

  it("does not count markup as words", () => {
    // 6 visible words wrapped in markup-heavy HTML. The old implementation
    // split on whitespace and counted tags, so this trimmed well under 6.
    const html =
      '<ul><li><a href="https://x.test" target="_blank" rel="nofollow">one two</a></li>' +
      "<li>three four</li><li>five six</li></ul>";
    expect(countWordsInHtml(html)).toBe(6);
    expect(capWordCount(html, 6)).toBe(html);
  });

  it("trims to the cap, measured the same way as countWordsInHtml", () => {
    const html = "<p>" + Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ") + "</p>";
    const out = capWordCount(html, 20);
    expect(countWordsInHtml(out)).toBe(20);
  });

  it("never slices a tag in half", () => {
    const html =
      '<p>alpha beta</p><p><a href="https://example.test/a/b">gamma delta</a> epsilon</p>';
    const out = capWordCount(html, 3);
    // Every "<" that opens a tag must still have its ">".
    const opens = (out.match(/</g) || []).length;
    const closes = (out.match(/>/g) || []).length;
    expect(opens).toBe(closes);
  });
});

describe("capWordCount — closes what the cut left open", () => {
  it("closes a trimmed list, not just <p>", () => {
    const html = "<ul><li>one two</li><li>three four</li><li>five six</li></ul>";
    const out = capWordCount(html, 3);
    expect(out).toMatch(/<\/li>/);
    expect(out).toMatch(/<\/ul>$/);
  });

  it("closes a trimmed anchor", () => {
    const html = '<p>one <a href="https://x.test">two three four</a></p>';
    const out = capWordCount(html, 2);
    expect(out).toMatch(/<\/a>/);
    expect(out).toMatch(/<\/p>$/);
  });
});

describe("closeOpenTags", () => {
  it("closes innermost-first", () => {
    expect(closeOpenTags("<ul><li>x")).toBe("<ul><li>x</li></ul>");
  });

  it("leaves balanced HTML untouched", () => {
    const html = "<p>done</p><ul><li>a</li></ul>";
    expect(closeOpenTags(html)).toBe(html);
  });

  it("does not try to close void elements", () => {
    expect(closeOpenTags("<p>a<br>b</p>")).toBe("<p>a<br>b</p>");
    expect(closeOpenTags('<p>a<img src="x.png">')).toBe('<p>a<img src="x.png"></p>');
  });

  it("ignores self-closing syntax", () => {
    expect(closeOpenTags("<p>a<br/>")).toBe("<p>a<br/></p>");
  });

  it("tolerates mis-nesting instead of throwing", () => {
    expect(() => closeOpenTags("<p><strong>x</p>")).not.toThrow();
  });
});
