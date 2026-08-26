import { describe, it, expect } from "vitest";
import {
  evaluateRateRules,
  type CounterTotals,
  type FiredAlert,
} from "./pipeline-alerts";

/**
 * evaluateRateRules is pure — no DB — so the thresholds themselves are
 * testable. These assert the two properties that matter operationally:
 * a rule must not fire below its minimum sample size (one broken blog
 * cannot page the team), and it must fire once genuinely crossed.
 */

function totals(over: Partial<CounterTotals> = {}): CounterTotals {
  return {
    runs: 24,
    published: 0,
    failed: 0,
    truncatedSalvaged: 0,
    imageless: 0,
    metaWriteUnverified: 0,
    indexNowRejected: 0,
    blockedRegenerate: 0,
    linkingSkipped: 0,
    deepseek: 0,
    claude: 0,
    ...over,
  };
}

const keys = (a: FiredAlert[]) => a.map((x) => x.key).sort();
const quiet = totals();

describe("publish.failure_rate", () => {
  it("stays silent below the 10-attempt minimum, however bad the ratio", () => {
    // 4 of 5 failed = 80%, but the sample is too small to mean anything.
    const t6 = totals({ published: 1, failed: 4 });
    expect(keys(evaluateRateRules(t6, quiet, "auto"))).not.toContain(
      "publish.failure_rate",
    );
  });

  it("fires above 20% once the sample is real", () => {
    const t6 = totals({ published: 7, failed: 3 }); // 30% of 10
    expect(keys(evaluateRateRules(t6, quiet, "auto"))).toContain(
      "publish.failure_rate",
    );
  });

  it("does not fire at exactly the threshold", () => {
    const t6 = totals({ published: 8, failed: 2 }); // exactly 20%
    expect(keys(evaluateRateRules(t6, quiet, "auto"))).not.toContain(
      "publish.failure_rate",
    );
  });
});

describe("24h quality rules", () => {
  it("all stay silent below the 20-post minimum", () => {
    // Every counter equal to published = 100% on every rule, but only 19
    // posts, so nothing should fire.
    const t24 = totals({
      published: 19,
      truncatedSalvaged: 19,
      imageless: 19,
      metaWriteUnverified: 19,
      indexNowRejected: 19,
      blockedRegenerate: 19,
      linkingSkipped: 19,
    });
    expect(evaluateRateRules(quiet, t24, "auto")).toEqual([]);
  });

  it("fires every rule at once when the sample is large and everything is broken", () => {
    const t24 = totals({
      published: 100,
      truncatedSalvaged: 100,
      imageless: 100,
      metaWriteUnverified: 100,
      indexNowRejected: 100,
      blockedRegenerate: 100,
      linkingSkipped: 100,
    });
    expect(keys(evaluateRateRules(quiet, t24, "auto"))).toEqual([
      "content.imageless",
      "content.truncated",
      "indexnow.rejected",
      "linking.skipped",
      "meta.unverified",
      "scrubber.blocked",
    ]);
  });

  it("truncation fires at 6% and not at 5%", () => {
    const at5 = totals({ published: 100, truncatedSalvaged: 5 });
    const at6 = totals({ published: 100, truncatedSalvaged: 6 });
    expect(keys(evaluateRateRules(quiet, at5, "auto"))).not.toContain(
      "content.truncated",
    );
    expect(keys(evaluateRateRules(quiet, at6, "auto"))).toContain(
      "content.truncated",
    );
  });

  it("linking tolerates 30% — new blogs legitimately have no siblings", () => {
    const at30 = totals({ published: 100, linkingSkipped: 30 });
    const at31 = totals({ published: 100, linkingSkipped: 31 });
    expect(keys(evaluateRateRules(quiet, at30, "auto"))).not.toContain(
      "linking.skipped",
    );
    expect(keys(evaluateRateRules(quiet, at31, "auto"))).toContain(
      "linking.skipped",
    );
  });

  it("severities are set as documented", () => {
    const t24 = totals({
      published: 100,
      truncatedSalvaged: 100,
      imageless: 100,
      metaWriteUnverified: 100,
      linkingSkipped: 100,
    });
    const bySeverity = Object.fromEntries(
      evaluateRateRules(quiet, t24, "auto").map((a) => [a.key, a.severity]),
    );
    // A mutilated article and unwritten meta are pages; a missing image or a
    // link-less new blog is not.
    expect(bySeverity["content.truncated"]).toBe("critical");
    expect(bySeverity["meta.unverified"]).toBe("critical");
    expect(bySeverity["content.imageless"]).toBe("warn");
    expect(bySeverity["linking.skipped"]).toBe("warn");
  });
});

describe("provider.claude_share", () => {
  it("fires when Claude serves the majority in auto mode", () => {
    const t6 = totals({ deepseek: 20, claude: 40 });
    expect(keys(evaluateRateRules(t6, quiet, "auto"))).toContain(
      "provider.claude_share",
    );
  });

  it("stays silent when the operator deliberately chose Claude", () => {
    const t6 = totals({ deepseek: 0, claude: 60 });
    expect(keys(evaluateRateRules(t6, quiet, "claude"))).not.toContain(
      "provider.claude_share",
    );
  });

  it("stays silent below the 50-call minimum", () => {
    const t6 = totals({ deepseek: 0, claude: 49 });
    expect(keys(evaluateRateRules(t6, quiet, "auto"))).not.toContain(
      "provider.claude_share",
    );
  });
});

describe("a healthy platform", () => {
  it("fires nothing", () => {
    const t6 = totals({ published: 60, failed: 2, deepseek: 180, claude: 4 });
    const t24 = totals({
      published: 240,
      failed: 6,
      truncatedSalvaged: 1,
      imageless: 2,
      metaWriteUnverified: 5,
      indexNowRejected: 3,
      blockedRegenerate: 2,
      linkingSkipped: 20,
      deepseek: 700,
      claude: 12,
    });
    expect(evaluateRateRules(t6, t24, "auto")).toEqual([]);
  });
});

describe("every fired alert is actionable", () => {
  it("carries a key, a title with numbers, and a runbook", () => {
    const t24 = totals({ published: 100, truncatedSalvaged: 50 });
    const fired = evaluateRateRules(quiet, t24, "auto");
    expect(fired.length).toBeGreaterThan(0);
    for (const a of fired) {
      expect(a.key).toBeTruthy();
      expect(a.title).toMatch(/\d/);
      expect(a.detail).toMatch(/\d/);
      expect(a.runbook.length).toBeGreaterThan(20);
    }
  });
});
