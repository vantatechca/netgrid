import { describe, it, expect } from "vitest";
import { parseDataForSeoItem, parseDataForSeoItems } from "./parse";
import fixture from "./fixtures/keyword-suggestions.json";
import type { DataForSeoKeywordItem } from "./types";

// The fixture is hand-written and PROVISIONAL (see its own _PROVISIONAL
// field and the file header on parse.ts) — these tests exercise the
// null-tolerant extraction contract, not a guarantee that DataForSEO's real
// response matches this exact shape.
const items = fixture.tasks[0].result[0].items as DataForSeoKeywordItem[];

describe("parseDataForSeoItem", () => {
  it("extracts every field from a complete item", () => {
    const parsed = parseDataForSeoItem(items[0]);
    expect(parsed).not.toBeNull();
    expect(parsed?.keyword).toBe("bpc 157");
    expect(parsed?.searchVolume).toBe(22200);
    expect(parsed?.keywordDifficulty).toBe(34);
    expect(parsed?.mainIntent).toBe("informational");
    expect(parsed?.monthlySearches).toHaveLength(3);
    expect(parsed?.monthlySearches?.[0]).toEqual({ year: 2026, month: 7, searchVolume: 22200 });
  });

  it("treats restricted-vertical nulls (cpc/competition) as expected, not errors", () => {
    const parsed = parseDataForSeoItem(items[1]);
    expect(parsed).not.toBeNull();
    expect(parsed?.cpc).toBeNull();
    expect(parsed?.competition).toBeNull();
    expect(parsed?.searchVolume).toBe(2900);
    expect(parsed?.mainIntent).toBe("transactional");
  });

  it("handles a missing monthly_searches array and empty nested objects without throwing", () => {
    const parsed = parseDataForSeoItem(items[2]);
    expect(parsed).not.toBeNull();
    expect(parsed?.monthlySearches).toBeNull();
    expect(parsed?.keywordDifficulty).toBeNull();
    expect(parsed?.mainIntent).toBeNull();
    expect(parsed?.searchVolume).toBe(8100);
  });

  it("drops an item with no usable keyword text", () => {
    expect(parseDataForSeoItem(items[3])).toBeNull();
  });

  it("preserves the untouched item as raw", () => {
    const parsed = parseDataForSeoItem(items[0]);
    expect(parsed?.raw).toBe(items[0]);
  });

  it("never throws on a completely empty item", () => {
    expect(() => parseDataForSeoItem({} as DataForSeoKeywordItem)).not.toThrow();
    expect(parseDataForSeoItem({} as DataForSeoKeywordItem)).toBeNull();
  });

  it("never throws on malformed nested fields (wrong types)", () => {
    const malformed = {
      keyword: "malformed test",
      keyword_info: "not an object",
      keyword_properties: null,
      search_intent_info: 42,
    } as unknown as DataForSeoKeywordItem;
    expect(() => parseDataForSeoItem(malformed)).not.toThrow();
  });
});

describe("parseDataForSeoItems", () => {
  it("parses the whole fixture batch, dropping the empty-keyword item", () => {
    const parsed = parseDataForSeoItems(items);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((p) => p.keyword)).toEqual([
      "bpc 157",
      "where to buy bpc 157",
      "bpc 157 dosage",
    ]);
  });
});
