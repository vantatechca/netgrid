import { describe, it, expect, afterEach } from "vitest";
import { runScrubber, runScrubberLite } from "./index";
import {
  scrubberEnforcementMode,
  shouldHoldForReview,
  scrubberSummary,
  DEFAULT_SCRUBBER_ENFORCEMENT,
} from "./enforcement";
import type { StyleProfile } from "../types";

/**
 * The verdict matrix is the whole point of T07. Before it, runScrubber's
 * `regenerateRequested` had no consumer and `flaggedForReview` was INVERTED
 * for the worst class of post: on a terminal (critical) violation the code
 * set flaggedForReview = false while finalStatus said FLAGGED_FOR_REVIEW.
 * So the only posts guaranteed to reach publish carrying no review flag were
 * the ones the scrubber had rejected outright.
 */

function profile(over: Partial<StyleProfile> = {}): StyleProfile {
  return {
    blogId: "00000000-0000-0000-0000-000000000001",
    nicheKey: "peptides",
    subNicheId: 1,
    voiceId: 1,
    skeletonId: 1,
    cadenceId: 1,
    quirks: [1, 2],
    schemaId: 1,
    tagSetId: 1,
    citationStyleId: 1,
    structuralPool: [1, 2, 3],
    compliancePhraseIds: [1, 2],
    compliancePlacement: "bottom",
    wordBandMin: 0,
    wordBandMax: 100000,
    scrubberStrictness: "loose",
    primaryCompounds: ["BPC-157", "TB-500"],
    secondaryCompounds: ["a", "b", "c", "d"],
    ...over,
  } as StyleProfile;
}

/** A body long enough not to trip the word-band floor. */
function body(paras: string[]): string {
  return paras.map((p) => `<p>${p}</p>`).join("");
}

const CLEAN = body([
  "Peptide storage depends on temperature and time. Most lyophilised material is stable at room temperature for shipping.",
  "Once reconstituted the picture changes. Refrigeration becomes the binding constraint, and the useful window shrinks to weeks rather than months.",
  "Researchers tracking stability generally log reconstitution date alongside concentration, because the two together determine what a later assay actually measures.",
]);

describe("the verdict is a single discriminant", () => {
  it("returns 'accepted' for clean content within thresholds", () => {
    const r = runScrubber({ content: CLEAN, profile: profile() });
    expect(r.verdict).toBe("accepted");
    expect(r.report.action).toBe("ACCEPTED");
    expect(r.report.finalStatus).toBe("ACCEPTED");
  });

  it("agrees with the legacy booleans on the accepted path", () => {
    const r = runScrubber({ content: CLEAN, profile: profile() });
    expect(r.flaggedForReview).toBe(false);
    expect(r.regenerateRequested).toBe(false);
  });
});

describe("the terminal-flag inversion is fixed", () => {
  it("never reports regenerate_requested with flaggedForReview=false", () => {
    // Whatever content produces a terminal verdict, the two must agree. This
    // is the exact defect: the worst posts used to carry the weakest flag.
    for (const content of [
      CLEAN,
      body(["Short."]),
      body(["<h1>A heading the tag set may not allow</h1>"]),
      "",
    ]) {
      for (const strictness of ["loose", "standard", "strict"] as const) {
        const r = runScrubber({
          content,
          profile: profile({ scrubberStrictness: strictness }),
        });
        if (r.verdict === "regenerate_requested") {
          expect(r.flaggedForReview).toBe(true);
          expect(r.regenerateRequested).toBe(true);
        }
      }
    }
  });

  it("keeps flaggedForReview consistent with finalStatus in every case", () => {
    for (const strictness of ["loose", "standard", "strict"] as const) {
      const r = runScrubber({
        content: body(["Too short."]),
        profile: profile({ scrubberStrictness: strictness, wordBandMin: 500 }),
      });
      // FLAGGED_FOR_REVIEW in the report must never coexist with a false flag.
      if (r.report.finalStatus === "FLAGGED_FOR_REVIEW") {
        expect(r.flaggedForReview).toBe(true);
      }
      if (r.report.finalStatus === "ACCEPTED") {
        expect(r.flaggedForReview).toBe(false);
      }
    }
  });

  it("a flagged verdict always sets flaggedForReview", () => {
    const r = runScrubber({
      content: body(["Far too short for the band."]),
      profile: profile({ wordBandMin: 5000, scrubberStrictness: "strict" }),
    });
    expect(["accepted_with_flag", "regenerate_requested"]).toContain(r.verdict);
    expect(r.flaggedForReview).toBe(true);
  });
});

describe("short fields are scrubbed", () => {
  it("fixes an em dash in the title — the most visible tell we ship", () => {
    const r = runScrubber({
      content: CLEAN,
      profile: profile(),
      fields: { title: "Peptide Dosing — What The Data Says" },
    });
    expect(r.fields.title).toBeDefined();
    expect(r.fields.title).not.toContain("—");
  });

  it("returns only the fields it was given", () => {
    const r = runScrubber({
      content: CLEAN,
      profile: profile(),
      fields: { title: "A Title" },
    });
    expect(Object.keys(r.fields)).toEqual(["title"]);
  });

  it("returns an empty map when no fields are passed", () => {
    const r = runScrubber({ content: CLEAN, profile: profile() });
    expect(r.fields).toEqual({});
  });

  it("skips empty strings rather than emitting a key", () => {
    const r = runScrubber({
      content: CLEAN,
      profile: profile(),
      fields: { title: "", metaTitle: "Real Meta Title" },
    });
    expect(r.fields.title).toBeUndefined();
    expect(r.fields.metaTitle).toBeDefined();
  });
});

describe("the attempt counter reaches the report", () => {
  it("defaults to 0", () => {
    expect(runScrubber({ content: CLEAN, profile: profile() }).report.attempts).toBe(0);
  });

  it("records a caller-driven retry", () => {
    const r = runScrubber({ content: CLEAN, profile: profile(), attempt: 2 });
    expect(r.report.attempts).toBe(2);
  });
});

describe("runScrubberLite — the non-profile path", () => {
  it("still returns a fields map", () => {
    const r = runScrubberLite(CLEAN, { title: "Dosing — Explained" });
    expect(r.fields.title).not.toContain("—");
  });

  it("works with no fields argument (back-compatible)", () => {
    const r = runScrubberLite(CLEAN);
    expect(r.fields).toEqual({});
    expect(typeof r.violationCount).toBe("number");
  });
});

describe("enforcement mode", () => {
  const original = process.env.SCRUBBER_ENFORCEMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.SCRUBBER_ENFORCEMENT;
    else process.env.SCRUBBER_ENFORCEMENT = original;
  });

  it("defaults to shadow when unset", () => {
    delete process.env.SCRUBBER_ENFORCEMENT;
    expect(scrubberEnforcementMode()).toBe(DEFAULT_SCRUBBER_ENFORCEMENT);
    expect(scrubberEnforcementMode()).toBe("shadow");
  });

  it("falls back to shadow on an unrecognised value", () => {
    process.env.SCRUBBER_ENFORCEMENT = "yes-please";
    expect(scrubberEnforcementMode()).toBe("shadow");
  });

  it("is case- and whitespace-tolerant", () => {
    process.env.SCRUBBER_ENFORCEMENT = "  ENFORCE  ";
    expect(scrubberEnforcementMode()).toBe("enforce");
  });

  it("holds a flagged post ONLY in enforce mode", () => {
    for (const [mode, expected] of [
      ["off", false],
      ["shadow", false],
      ["enforce", true],
    ] as const) {
      process.env.SCRUBBER_ENFORCEMENT = mode;
      expect(shouldHoldForReview(true)).toBe(expected);
    }
  });

  it("never holds an unflagged post, whatever the mode", () => {
    for (const mode of ["off", "shadow", "enforce"]) {
      process.env.SCRUBBER_ENFORCEMENT = mode;
      expect(shouldHoldForReview(false)).toBe(false);
    }
  });
});

describe("scrubberSummary", () => {
  it("handles a missing report", () => {
    expect(scrubberSummary(null)).toBe("no scrubber report");
    expect(scrubberSummary(undefined)).toBe("no scrubber report");
  });

  it("leads with counts and names the first blocking violation", () => {
    const r = runScrubber({
      content: body(["Short."]),
      profile: profile({ wordBandMin: 5000, scrubberStrictness: "strict" }),
    });
    const summary = scrubberSummary(r.report);
    expect(summary).toMatch(/critical/);
    expect(summary).toMatch(/high/);
  });
});
