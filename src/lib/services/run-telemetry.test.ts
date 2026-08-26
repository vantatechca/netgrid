import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";

// TELEMETRY_ENABLED=0 makes every DB write a no-op, so the counter/attribution
// logic is testable without a database. src/lib/db exports a lazy Proxy, so
// importing this module never opens a connection either way.
beforeAll(() => {
  process.env.TELEMETRY_ENABLED = "0";
});

const {
  runWithTelemetry,
  withBlog,
  bumpCounter,
  setCounter,
  bumpProvider,
  snapshotCounters,
  currentRunId,
  recordPipelineError,
  setCurrentPostId,
  trackBackground,
  emptyCounters,
} = await import("./run-telemetry");

afterEach(() => {
  vi.restoreAllMocks();
});

/** Silence the console lines recordPipelineError intentionally still emits. */
function quiet() {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
}

describe("emptyCounters", () => {
  it("starts every counter at zero", () => {
    const c = emptyCounters();
    expect(c.published).toBe(0);
    expect(c.truncatedSalvaged).toBe(0);
    expect(c.providerUsed).toEqual({ deepseek: 0, claude: 0 });
  });
});

describe("outside a run scope", () => {
  it("counter bumps are no-ops rather than throwing", () => {
    expect(() => bumpCounter("published")).not.toThrow();
    expect(() => setCounter("due", 5)).not.toThrow();
    expect(() => bumpProvider("claude")).not.toThrow();
    expect(() => setCurrentPostId("post-1")).not.toThrow();
    expect(() => trackBackground(Promise.resolve())).not.toThrow();
  });

  it("reports no run id and no counters", () => {
    expect(currentRunId()).toBeUndefined();
    expect(snapshotCounters()).toBeUndefined();
  });
});

describe("runWithTelemetry", () => {
  it("exposes a run id inside the scope and clears it after", async () => {
    quiet();
    let inside: string | undefined;
    await runWithTelemetry({ job: "test" }, async () => {
      inside = currentRunId();
    });
    expect(inside).toMatch(/^[0-9a-f-]{36}$/);
    expect(currentRunId()).toBeUndefined();
  });

  it("accumulates counters bumped from nested call frames", async () => {
    quiet();
    const snap = await runWithTelemetry({ job: "test" }, async () => {
      // Simulates a deep call site (content-generator) with no knowledge
      // of the run it is inside.
      async function deep() {
        bumpCounter("truncatedSalvaged");
        bumpProvider("deepseek", 2);
      }
      await deep();
      setCounter("published", 7);
      return snapshotCounters();
    });
    expect(snap?.truncatedSalvaged).toBe(1);
    expect(snap?.published).toBe(7);
    expect(snap?.providerUsed).toEqual({ deepseek: 2, claude: 0 });
  });

  it("re-throws the body's error so route error handling is unchanged", async () => {
    quiet();
    await expect(
      runWithTelemetry({ job: "test" }, async () => {
        throw new Error("body exploded");
      }),
    ).rejects.toThrow("body exploded");
  });

  it("snapshot is a copy, not a live reference", async () => {
    quiet();
    await runWithTelemetry({ job: "test" }, async () => {
      const before = snapshotCounters()!;
      bumpCounter("published");
      bumpProvider("claude");
      expect(before.published).toBe(0);
      expect(before.providerUsed.claude).toBe(0);
    });
  });
});

describe("withBlog attribution", () => {
  it("shares counters across parallel blog frames", async () => {
    quiet();
    const snap = await runWithTelemetry({ job: "test" }, async () => {
      // Mirrors runAutoPublishCron's concurrent workers: counters must
      // accumulate into ONE run even though each blog has its own frame.
      await Promise.all(
        ["blog-a", "blog-b", "blog-c"].map((id) =>
          withBlog({ blogId: id }, async () => {
            await new Promise((r) => setTimeout(r, 1));
            bumpCounter("published");
          }),
        ),
      );
      return snapshotCounters();
    });
    expect(snap?.published).toBe(3);
  });

  it("keeps the blog frame per-branch under concurrency", async () => {
    quiet();
    const seen: Array<string | null> = [];
    const spy = vi.spyOn(console, "error");

    await runWithTelemetry({ job: "test" }, async () => {
      await Promise.all(
        ["blog-a", "blog-b"].map((id) =>
          withBlog({ blogId: id }, async () => {
            // Interleave so a shared frame would cross-contaminate.
            await new Promise((r) => setTimeout(r, id === "blog-a" ? 5 : 1));
            recordPipelineError({
              site: "test.attribution",
              code: "PUBLISH_ATTEMPT_FAILED",
              message: id,
            });
            seen.push(id);
          }),
        ),
      );
    });

    // Both branches recorded, and each recorded its own id — the frame did
    // not leak between the interleaved async branches.
    expect(seen.sort()).toEqual(["blog-a", "blog-b"]);
    expect(spy).toHaveBeenCalled();
  });

  it("runs the callback unchanged when there is no active run", async () => {
    const out = await withBlog({ blogId: "x" }, async () => "ran anyway");
    expect(out).toBe("ran anyway");
  });
});

describe("recordPipelineError", () => {
  it("never throws, inside or outside a run", async () => {
    quiet();
    expect(() =>
      recordPipelineError({
        site: "test.adhoc",
        code: "SETTINGS_READ_FAILED",
        message: "outside a run",
      }),
    ).not.toThrow();

    await runWithTelemetry({ job: "test" }, async () => {
      expect(() =>
        recordPipelineError({
          site: "test.inside",
          code: "SETTINGS_READ_FAILED",
          message: "inside a run",
        }),
      ).not.toThrow();
    });
  });

  it("routes warn severity to console.warn and error to console.error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    recordPipelineError({
      site: "test.sev",
      code: "AUTOCOMPLETE_HTTP",
      severity: "warn",
      message: "warned",
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("WARN AUTOCOMPLETE_HTTP @ test.sev"),
      "warned",
    );

    recordPipelineError({
      site: "test.sev",
      code: "META_WRITE_FAILED",
      message: "errored",
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("ERROR META_WRITE_FAILED @ test.sev"),
      "errored",
    );
  });
});
