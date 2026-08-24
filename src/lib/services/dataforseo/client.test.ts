import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { keywordSuggestions, dataForSeoConfigured, DataForSeoError } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SUCCESS_BODY = {
  status_code: 20000,
  status_message: "Ok.",
  tasks: [
    {
      status_code: 20000,
      status_message: "Ok.",
      cost: 0.0125,
      result: [{ items: [{ keyword: "bpc 157" }] }],
    },
  ],
};

describe("dataforseo/client", () => {
  beforeEach(() => {
    vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
    vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Safety net — idempotent even for tests that never enabled fake timers.
    vi.useRealTimers();
  });

  it("dataForSeoConfigured is true only when both credentials are set", () => {
    expect(dataForSeoConfigured()).toBe(true);
    vi.stubEnv("DATAFORSEO_PASSWORD", "");
    expect(dataForSeoConfigured()).toBe(false);
  });

  it("throws without calling fetch when not configured", async () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "");
    vi.stubEnv("DATAFORSEO_PASSWORD", "");
    await expect(
      keywordSuggestions({ keyword: "x", locationCode: 2840, languageCode: "en" }),
    ).rejects.toThrow(DataForSeoError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the request body as a JSON array, even for one task", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    await keywordSuggestions({ keyword: "bpc 157", locationCode: 2840, languageCode: "en" });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sentBody = JSON.parse(init?.body as string);
    expect(Array.isArray(sentBody)).toBe(true);
    expect(sentBody).toHaveLength(1);
    expect(sentBody[0].keyword).toBe("bpc 157");
  });

  it("sends HTTP Basic auth built from the two env vars", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    await keywordSuggestions({ keyword: "x", locationCode: 2840, languageCode: "en" });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    const expected = `Basic ${Buffer.from("test-login:test-password").toString("base64")}`;
    expect(headers.Authorization).toBe(expected);
  });

  it("returns items and cost on a fully successful call", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    const result = await keywordSuggestions({ keyword: "bpc 157", locationCode: 2840, languageCode: "en" });
    expect(result.cost).toBe(0.0125);
    expect(result.items).toEqual([{ keyword: "bpc 157" }]);
  });

  it("throws on envelope-level failure (HTTP 200, status_code != 20000) without retrying", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, { status_code: 40000, status_message: "Bad request", tasks: [] }),
    );
    await expect(
      keywordSuggestions({ keyword: "x", locationCode: 2840, languageCode: "en" }),
    ).rejects.toMatchObject({ level: "envelope" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws on task-level failure (envelope ok, task failed) without retrying", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        status_code: 20000,
        status_message: "Ok.",
        tasks: [{ status_code: 40501, status_message: "Invalid Field", result: null }],
      }),
    );
    await expect(
      keywordSuggestions({ keyword: "x", locationCode: 2840, languageCode: "en" }),
    ).rejects.toMatchObject({ level: "task" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // The client's retry backoff uses a real setTimeout (base 1s, doubling, up
  // to 3 retries — several real seconds total). Fake timers make these
  // deterministic and fast instead of actually sleeping in the test run.
  it("retries on HTTP 429 and succeeds once the retry returns 200", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(429, { status_message: "Too Many Requests" }))
      .mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    const promise = keywordSuggestions({ keyword: "x", locationCode: 2840, languageCode: "en" });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.items).toEqual([{ keyword: "bpc 157" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on HTTP 5xx", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    const promise = keywordSuggestions({ keyword: "x", locationCode: 2840, languageCode: "en" });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.items).toEqual([{ keyword: "bpc 157" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on a non-429 4xx (a request bug won't fix itself)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { status_message: "Unauthorized" }));
    await expect(
      keywordSuggestions({ keyword: "x", locationCode: 2840, languageCode: "en" }),
    ).rejects.toMatchObject({ level: "http", statusCode: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on persistent 429s", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, {}));
    const promise = keywordSuggestions({ keyword: "x", locationCode: 2840, languageCode: "en" });
    // Assert on the eventual rejection BEFORE advancing timers, so the
    // rejection is already being awaited when it lands (an unawaited
    // rejected promise mid-advance would otherwise be an unhandled rejection).
    const assertion = expect(promise).rejects.toMatchObject({ level: "http", statusCode: 429 });
    await vi.runAllTimersAsync();
    await assertion;
    // 1 initial attempt + 3 retries = 4 calls total.
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
