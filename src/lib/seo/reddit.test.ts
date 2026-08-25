import { describe, it, expect, vi, afterEach } from "vitest";
import { buildPostSlug, redditSlug, hasReddit } from "./reddit";

describe("redditSlug", () => {
  it("appends -reddit to a slugified keyword", () => {
    expect(redditSlug("BPC-157 TB500 Blend Dosage Chart")).toBe(
      "bpc-157-tb500-blend-dosage-chart-reddit",
    );
  });

  it("is idempotent when the source already ends in reddit", () => {
    expect(redditSlug("bpc-157 dosage reddit")).toBe("bpc-157-dosage-reddit");
  });

  it("falls back to a bare reddit slug for empty input", () => {
    expect(redditSlug("")).toBe("reddit");
    expect(redditSlug(null)).toBe("reddit");
  });
});

describe("hasReddit", () => {
  it("matches reddit as a whole word only", () => {
    expect(hasReddit("BPC-157 Dosage Reddit")).toBe(true);
    expect(hasReddit("BPC-157 Dosage")).toBe(false);
  });
});

describe("buildPostSlug", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to -reddit when no city is available", () => {
    expect(buildPostSlug("BPC-157 TB500 Dosage", null)).toBe(
      "bpc-157-tb500-dosage-reddit",
    );
    expect(buildPostSlug("BPC-157 TB500 Dosage", undefined)).toBe(
      "bpc-157-tb500-dosage-reddit",
    );
  });

  it("picks the reddit suffix when the random draw is >= 0.5", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    expect(buildPostSlug("BPC-157 TB500 Dosage", "Toronto")).toBe(
      "bpc-157-tb500-dosage-reddit",
    );
  });

  it("picks the city suffix when the random draw is < 0.5", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(buildPostSlug("BPC-157 TB500 Dosage", "Toronto")).toBe(
      "bpc-157-tb500-dosage-toronto",
    );
  });

  it("is idempotent when the source already ends in the city slug", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // would otherwise pick reddit
    expect(buildPostSlug("BPC-157 Dosage in Toronto", "Toronto")).toBe(
      "bpc-157-dosage-in-toronto",
    );
  });

  it("is idempotent when the source already ends in reddit, even with a city available", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // would otherwise pick city
    expect(buildPostSlug("BPC-157 Dosage Reddit", "Toronto")).toBe(
      "bpc-157-dosage-reddit",
    );
  });

  it("falls back to the bare city slug when the keyword has no usable characters", () => {
    expect(buildPostSlug("", "Toronto")).toBe("toronto");
  });

  it("falls back to a bare reddit slug when neither keyword nor city has usable characters", () => {
    expect(buildPostSlug("", null)).toBe("reddit");
  });
});
