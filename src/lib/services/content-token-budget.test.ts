import { describe, it, expect, afterEach } from "vitest";
import {
  outputTokenBudget,
  deepseekMaxOutputTokens,
  TOKENS_PER_WORD,
  JSON_ENVELOPE_TOKENS,
  TOKEN_BUDGET_SAFETY,
  MIN_OUTPUT_TOKENS,
  CLAUDE_MAX_OUTPUT_TOKENS,
} from "./content-token-budget";

/**
 * The regression this file exists to prevent is the 4096 clamp coming back.
 * Before T06 the budget expression was:
 *
 *   Math.min(4096, Math.max(3000, Math.round(MAX_WORDS * 3.2)))
 *
 * which evaluated to exactly 4096 under every configuration reachable from
 * the repo, because MAX_WORDS is 2000 and 2000 * 3.2 = 6400. At the file's
 * own stated French ratio that bought ~1280 words against a 1000-2000 band,
 * so French articles were structurally guaranteed to truncate.
 */

describe("outputTokenBudget — the reference table", () => {
  // These are the values quoted in the module docblock. If the formula
  // changes, update both together and think about why.
  const cases: Array<[number, "en" | "fr", number]> = [
    [1000, "en", 3000], // floor
    [1500, "en", 4083],
    [2000, "en", 5175],
    [1000, "fr", 4140],
    [1500, "fr", 5808],
    [2000, "fr", 7475],
  ];

  for (const [words, lang, expected] of cases) {
    it(`${lang} ${words} words -> ${expected} tokens`, () => {
      expect(outputTokenBudget(words, lang)).toBe(expected);
    });
  }
});

describe("the 4096 clamp cannot come back", () => {
  it("exceeds 4096 for a French article at the prompt target", () => {
    // 1500 is the midpoint of the 1000-2000 network band — what the composer
    // actually asks the model for.
    expect(outputTokenBudget(1500, "fr")).toBeGreaterThan(4096);
  });

  it("exceeds 4096 for a French article at the band maximum", () => {
    expect(outputTokenBudget(2000, "fr")).toBeGreaterThan(4096);
  });

  it("exceeds 4096 for an English article at the band maximum", () => {
    expect(outputTokenBudget(2000, "en")).toBeGreaterThan(4096);
  });

  it("has no fixed upper clamp — the budget keeps growing with the word count", () => {
    const a = outputTokenBudget(2000, "fr");
    const b = outputTokenBudget(4000, "fr");
    expect(b).toBeGreaterThan(a);
  });
});

describe("language sensitivity", () => {
  it("budgets French more heavily than English at every length", () => {
    for (const words of [1000, 1250, 1500, 1750, 2000]) {
      expect(outputTokenBudget(words, "fr")).toBeGreaterThanOrEqual(
        outputTokenBudget(words, "en"),
      );
    }
  });

  it("treats an unresolved en_fr as French — over-budgeting is the safe error", () => {
    expect(outputTokenBudget(1500, "en_fr")).toBe(outputTokenBudget(1500, "fr"));
  });

  it("treats undefined as English", () => {
    expect(outputTokenBudget(1500, undefined)).toBe(
      outputTokenBudget(1500, "en"),
    );
  });
});

describe("the floor", () => {
  it("applies to short word budgets", () => {
    expect(outputTokenBudget(100, "en")).toBe(MIN_OUTPUT_TOKENS);
    expect(outputTokenBudget(0, "en")).toBe(MIN_OUTPUT_TOKENS);
  });

  it("does not apply once the formula exceeds it", () => {
    expect(outputTokenBudget(2000, "fr")).toBeGreaterThan(MIN_OUTPUT_TOKENS);
  });
});

describe("the formula matches its documented shape", () => {
  it("is ceil((words * perWord + envelope) * safety)", () => {
    const words = 1500;
    const expected = Math.ceil(
      (words * TOKENS_PER_WORD.fr + JSON_ENVELOPE_TOKENS) * TOKEN_BUDGET_SAFETY,
    );
    expect(outputTokenBudget(words, "fr")).toBe(expected);
  });
});

describe("provider ceilings", () => {
  const original = process.env.DEEPSEEK_MAX_OUTPUT_TOKENS;
  afterEach(() => {
    if (original === undefined) delete process.env.DEEPSEEK_MAX_OUTPUT_TOKENS;
    else process.env.DEEPSEEK_MAX_OUTPUT_TOKENS = original;
  });

  it("defaults DeepSeek to a conservative 8192", () => {
    delete process.env.DEEPSEEK_MAX_OUTPUT_TOKENS;
    expect(deepseekMaxOutputTokens()).toBe(8192);
  });

  it("is read lazily so the env var can change after module load", () => {
    process.env.DEEPSEEK_MAX_OUTPUT_TOKENS = "12000";
    expect(deepseekMaxOutputTokens()).toBe(12000);
  });

  it("ignores junk and non-positive values", () => {
    for (const bad of ["", "abc", "0", "-5"]) {
      process.env.DEEPSEEK_MAX_OUTPUT_TOKENS = bad;
      expect(deepseekMaxOutputTokens()).toBe(8192);
    }
  });

  it("both ceilings clear the largest budget the formula can produce", () => {
    // 2000 French words is the worst case reachable from the network band.
    const worst = outputTokenBudget(2000, "fr");
    expect(CLAUDE_MAX_OUTPUT_TOKENS).toBeGreaterThan(worst);
    delete process.env.DEEPSEEK_MAX_OUTPUT_TOKENS;
    expect(deepseekMaxOutputTokens()).toBeGreaterThan(worst);
  });
});
