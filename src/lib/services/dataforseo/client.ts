// DataForSEO API client.
//
// Design goals mirror the rest of the service layer (see
// embeddings-client.ts): never throw an unhandled error into a request path
// without a typed error, back off on rate limits / transient 5xx instead of
// hammering the API, and never retry a request that will just fail again.
//
// DataForSEO-specific requirements this implements (see
// docs/dataforseo-keyword-pipeline.md §3, §5):
//   - Every request body is a JSON ARRAY of task objects, even for one task.
//   - A 200 HTTP response can still carry a FAILED task — both the envelope
//     status_code and the task's own status_code must be checked.
//   - Auth is HTTP Basic on API credentials (not the account password).

import {
  DATAFORSEO_SUCCESS_CODE,
  type DataForSeoKeywordItem,
  type DataForSeoResponse,
} from "./types";

const BASE_URL = "https://api.dataforseo.com/v3";
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export function dataForSeoConfigured(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN ?? "";
  const password = process.env.DATAFORSEO_PASSWORD ?? "";
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

export class DataForSeoError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    /** Which layer reported failure — an HTTP-level, envelope-level, or task-level error. */
    readonly level?: "http" | "envelope" | "task" | "network",
  ) {
    super(message);
    this.name = "DataForSeoError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff from a 1s base, plus up to 30% jitter. */
function backoffMs(attempt: number): number {
  const base = BASE_BACKOFF_MS * 2 ** attempt;
  return base + Math.random() * base * 0.3;
}

export interface KeywordSuggestionsParams {
  keyword: string;
  locationCode: number;
  languageCode: string;
  /** DataForSEO allows up to 3000; keep this bounded by the caller's own budget. */
  limit?: number;
  offset?: number;
  /** When set, only keywords with search_volume above this are returned. */
  minSearchVolume?: number;
}

export interface DataForSeoCallResult {
  items: DataForSeoKeywordItem[];
  /** USD cost DataForSEO billed for this call, per the task's own `cost` field. */
  cost: number;
  endpoint: string;
}

/**
 * POST /v3/dataforseo_labs/google/keyword_suggestions/live — the primary,
 * single-seed-per-task endpoint (see plan §3). Retries HTTP 429/5xx and
 * network errors up to MAX_RETRIES with backoff; does NOT retry any other
 * 4xx (a request bug won't fix itself) or a task-level failure (a bad
 * keyword/location for THIS seed won't either — that seed's run just fails).
 */
export async function keywordSuggestions(
  params: KeywordSuggestionsParams,
): Promise<DataForSeoCallResult> {
  if (!dataForSeoConfigured()) {
    throw new DataForSeoError("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD is not configured");
  }

  const endpoint = "dataforseo_labs/google/keyword_suggestions/live";
  const body = [
    {
      keyword: params.keyword,
      location_code: params.locationCode,
      language_code: params.languageCode,
      limit: params.limit ?? 200,
      offset: params.offset ?? 0,
      include_serp_info: false,
      ...(params.minSearchVolume != null
        ? { filters: [["keyword_info.search_volume", ">", params.minSearchVolume]] }
        : {}),
    },
  ];

  let lastError: DataForSeoError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        res = await fetch(`${BASE_URL}/${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      lastError = new DataForSeoError(
        `Network error calling DataForSEO: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        "network",
      );
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }

    if (res.status === 429 || res.status >= 500) {
      lastError = new DataForSeoError(`DataForSEO HTTP ${res.status}`, res.status, "http");
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }

    if (!res.ok) {
      let detail = "";
      try {
        const parsed = (await res.json()) as { status_message?: string };
        detail = parsed.status_message ?? "";
      } catch {
        // ignore body parse failure — the HTTP status is still informative
      }
      throw new DataForSeoError(
        `DataForSEO HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        res.status,
        "http",
      );
    }

    const parsed = (await res.json()) as DataForSeoResponse<DataForSeoKeywordItem>;

    if (parsed.status_code !== DATAFORSEO_SUCCESS_CODE) {
      throw new DataForSeoError(
        `DataForSEO envelope failed (${parsed.status_code}): ${parsed.status_message ?? "no message"}`,
        parsed.status_code,
        "envelope",
      );
    }

    const task = parsed.tasks?.[0];
    if (!task) {
      throw new DataForSeoError("DataForSEO response had no tasks", parsed.status_code, "envelope");
    }
    if (task.status_code !== DATAFORSEO_SUCCESS_CODE) {
      throw new DataForSeoError(
        `DataForSEO task failed (${task.status_code}): ${task.status_message ?? "no message"}`,
        task.status_code,
        "task",
      );
    }

    return {
      items: task.result?.[0]?.items ?? [],
      cost: task.cost ?? 0,
      endpoint,
    };
  }

  // Unreachable — the loop above always either returns or throws. Satisfies
  // the type checker without a non-null assertion.
  throw lastError ?? new DataForSeoError("DataForSEO request failed for an unknown reason");
}
