import { describe, it, expect } from "vitest";
import {
  appendBrandToTitle,
  capMetaDescription,
  postSlug,
  stripLegacyRedditToken,
} from "./meta-suffix";
import {
  measureTitlePx,
  measureDescriptionPx,
  TITLE_MAX_PX,
  DESC_MAX_PX,
} from "./text-width";

const BRAND = "Montreal Peptides";
const SHORT_TITLE = "Where to Buy Peptides in Montreal"; // 309px @20px
const LONG_TITLE =
  "Where to Buy Research Peptides in Montreal: Sourcing, Cold-Chain Shipping and Pricing"; // 790px

describe("stripLegacyRedditToken", () => {
  it("removes the token the old injector appended", () => {
    expect(stripLegacyRedditToken("Where to Buy Peptides in Montreal Reddit")).toBe(
      "Where to Buy Peptides in Montreal",
    );
  });

  it("removes the token together with its separator", () => {
    expect(stripLegacyRedditToken("Peptides in Montreal | Reddit")).toBe(
      "Peptides in Montreal",
    );
  });

  it("collapses a value that was ONLY the token (the empty-completion bug)", () => {
    expect(stripLegacyRedditToken("Reddit")).toBe("");
  });

  it("removes a doubled token", () => {
    expect(stripLegacyRedditToken("Buy Peptides Reddit Reddit")).toBe("Buy Peptides");
  });

  it("leaves a mid-sentence mention alone", () => {
    const s = "What Reddit threads get wrong about peptide storage";
    expect(stripLegacyRedditToken(s)).toBe(s);
  });

  it("is idempotent", () => {
    const once = stripLegacyRedditToken("Buy Peptides Reddit");
    expect(stripLegacyRedditToken(once)).toBe(once);
  });
});

describe("appendBrandToTitle", () => {
  it("appends the brand when the keyword title fits beside it", () => {
    expect(appendBrandToTitle(SHORT_TITLE, BRAND)).toBe(
      "Where to Buy Peptides in Montreal | Montreal Peptides",
    );
  });

  it("drops the brand rather than truncating the keyword phrase", () => {
    const out = appendBrandToTitle(LONG_TITLE, BRAND);
    expect(out).not.toMatch(/Montreal Peptides$/);
    expect(out).toBe("Where to Buy Research Peptides in Montreal: Sourcing");
  });

  it("never appends twice", () => {
    const once = appendBrandToTitle(SHORT_TITLE, BRAND);
    expect(appendBrandToTitle(once, BRAND)).toBe(once);
  });

  it("is a no-op suffix when no brand is configured", () => {
    expect(appendBrandToTitle(SHORT_TITLE, null)).toBe(SHORT_TITLE);
    expect(appendBrandToTitle(SHORT_TITLE, "")).toBe(SHORT_TITLE);
  });

  it("strips a legacy token before branding", () => {
    expect(appendBrandToTitle("Where to Buy Peptides in Montreal Reddit", BRAND)).toBe(
      "Where to Buy Peptides in Montreal | Montreal Peptides",
    );
  });

  it("falls back to the brand alone when there is no usable base", () => {
    expect(appendBrandToTitle("", BRAND)).toBe(BRAND);
    expect(appendBrandToTitle("Reddit", BRAND)).toBe(BRAND);
  });

  it("always stays inside the audit ceiling", () => {
    for (const t of [SHORT_TITLE, LONG_TITLE, "", "Reddit", "x".repeat(400)]) {
      for (const b of [BRAND, null, "A Very Long Store Name For Testing Budgets"]) {
        expect(measureTitlePx(appendBrandToTitle(t, b))).toBeLessThanOrEqual(TITLE_MAX_PX);
      }
    }
  });
});

describe("capMetaDescription", () => {
  it("strips the legacy token and keeps the sentence", () => {
    expect(
      capMetaDescription(
        "Where to buy peptides in Montreal: verified sourcing, cold-chain shipping, and what local buyers should check before ordering. Reddit",
      ),
    ).toBe(
      "Where to buy peptides in Montreal: verified sourcing, cold-chain shipping, and what local buyers should check before ordering.",
    );
  });

  it("adds no suffix of any kind", () => {
    expect(capMetaDescription("A perfectly ordinary meta description.")).toBe(
      "A perfectly ordinary meta description.",
    );
  });

  it("caps an over-long description inside the audit ceiling", () => {
    const long = "Buy peptides in Montreal with verified sourcing. ".repeat(20);
    expect(measureDescriptionPx(capMetaDescription(long))).toBeLessThanOrEqual(DESC_MAX_PX);
  });
});

describe("postSlug", () => {
  it("emits a plain slug with no suffix", () => {
    expect(postSlug("where to buy peptides")).toBe("where-to-buy-peptides");
  });

  it("folds diacritics", () => {
    expect(postSlug("École des Paris")).toBe("ecole-des-paris");
  });

  it("uses the primary segment of a separated meta title", () => {
    expect(postSlug("Buy Peptides in Montreal | Montreal Peptides")).toBe(
      "buy-peptides-in-montreal",
    );
  });

  it("strips a legacy token instead of slugifying it", () => {
    expect(postSlug("Buy Peptides in Montreal Reddit")).toBe("buy-peptides-in-montreal");
  });

  it("returns '' when nothing is usable, so the caller omits the slug", () => {
    expect(postSlug("!!!")).toBe("");
    expect(postSlug(null)).toBe("");
  });
});
