// DataForSEO response types — PROVISIONAL.
//
// Built from docs/dataforseo-keyword-pipeline.md §3, which itself says the
// endpoint surface and field names "reflect knowledge current to roughly
// mid-2026 and DataForSEO ships changes regularly." No live credentials were
// available while building this, so these types were never checked against a
// real response (see §8 "Verify before coding", and
// scripts/capture-dataforseo-fixtures.ts below).
//
// Every field is optional and every consumer (parse.ts) treats a missing or
// differently-shaped field as absent rather than throwing — a wrong guess
// here should degrade to "this field wasn't extracted", never a crash. Once
// an operator runs the capture script with real credentials, replace
// fixtures/keyword-suggestions.json with the real response and tighten these
// types to match, keeping the same null-tolerance.

export interface DataForSeoMonthlySearch {
  year?: number;
  month?: number;
  search_volume?: number | null;
}

export interface DataForSeoKeywordInfo {
  search_volume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  low_top_of_page_bid?: number | null;
  high_top_of_page_bid?: number | null;
  monthly_searches?: DataForSeoMonthlySearch[] | null;
}

export interface DataForSeoKeywordProperties {
  keyword_difficulty?: number | null;
}

export interface DataForSeoSearchIntentInfo {
  main_intent?: string | null;
}

export interface DataForSeoKeywordItem {
  keyword?: string;
  keyword_info?: DataForSeoKeywordInfo | null;
  keyword_properties?: DataForSeoKeywordProperties | null;
  search_intent_info?: DataForSeoSearchIntentInfo | null;
  // Preserve any field this type doesn't know about — it still survives into
  // client_keywords.raw untouched, even if these types are stale.
  [key: string]: unknown;
}

export interface DataForSeoTaskResult<T> {
  items?: T[] | null;
}

export interface DataForSeoTask<T> {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: Array<DataForSeoTaskResult<T>> | null;
}

export interface DataForSeoResponse<T> {
  version?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: Array<DataForSeoTask<T>> | null;
}

/** DataForSEO success code at both the envelope and task level. */
export const DATAFORSEO_SUCCESS_CODE = 20000;
