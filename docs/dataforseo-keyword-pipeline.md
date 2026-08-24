# DataForSEO keyword pipeline — implementation plan

Status: **planned, not yet built.** This document is the agreed design for the
keyword research pipeline described in the implementation brief. It records the
decisions taken against Netgrid's existing conventions so the implementation
commit is mechanical.

**Scope.** A seed list (plus a location) in, a deduplicated keyword corpus in
Postgres out. It is a data store other parts of Netgrid can query later — not a
UI feature, not wired into content generation or publishing, no scoring or
ranking logic of any kind.

---

## 1. What the repo already has (and what this reuses)

Recon findings that shaped the plan:

| Concern | What exists today | What this pipeline does |
|---|---|---|
| Job runner | `/api/cron/*` routes guarded by `verifyCronSecret` (`src/lib/auth/helpers.ts`), invoked by Render docker cron services declared in `render.yaml` | Reuses it. No queue dependency added. |
| Migrations | Hand-written idempotent SQL in `src/lib/db/migrations`, applied by `src/lib/db/migrate.mjs` on Render `preDeployCommand`. **`drizzle-kit migrate` is not the source of truth** — see `migrations/README.md` | Adds `0035_keyword_corpus.sql`, hand-written and idempotent. |
| DB access | Drizzle over `@neondatabase/serverless` HTTP driver (`src/lib/db/index.ts`) | Same. Note the HTTP driver has no interactive transactions — see §4. |
| Keyword data | `client_keywords` + `keyword-scraper.ts` (Google Autocomplete, no volume). Its header comment explicitly anticipates "a volume-bearing source (Bing Webmaster, DataForSEO)" | **Left untouched.** The corpus is a separate store; binding it to content generation is a later, separate decision. |
| External API clients | `embeddings-client.ts` (typed error class, retry with backoff, env-gated `…Configured()` predicate), `pagespeed-client.ts` | The DataForSEO client follows the same shape. |
| Tests | **None.** No runner, no test files | Adds `vitest` as a devDependency (approved). |
| `.env.example` | **Does not exist.** Env is documented in `render.yaml` | Creates one, and adds the new keys to `render.yaml`. |

### Decisions taken

1. **Entrypoint — script *and* cron route.** The runner lives in the service
   layer; a `tsx` script drives it on demand, and a cron route drives it on a
   schedule. The Render cron service is written into `render.yaml` **commented
   out**, so nothing spends API credit until an operator deliberately enables it.
2. **Tests — `vitest`, devDependency only.** No runtime dependency added.
3. **Fixtures — captured by a script, not by me.** No DataForSEO credentials in
   the build environment, so the parser is written defensively against
   provisional fixtures and the real ones land in a follow-up. See §6.
4. **Table names — as the brief specifies** (`keywords`, `keyword_seeds`,
   `keyword_runs`). No SQL conflict with the existing `client_keywords` table or
   the `clients.keyword_seeds` *column*; header comments in both the migration
   and `schema.ts` spell out the distinction.

---

## 2. Files

```
src/lib/db/migrations/0035_keyword_corpus.sql   new  — three tables + indexes
src/lib/db/schema.ts                            edit — mirror the three tables
src/lib/services/dataforseo/client.ts           new  — auth, retry, status checks, cost
src/lib/services/dataforseo/parse.ts            new  — pure response → row mapping
src/lib/services/dataforseo/types.ts            new  — types built from fixtures
src/lib/services/dataforseo/parse.test.ts       new  — vitest, fixtures only, no network
src/lib/services/dataforseo/fixtures/*.json     new  — captured responses
src/lib/services/keyword-corpus-runner.ts       new  — orchestration + persistence
scripts/pull-keywords.ts                        new  — CLI entrypoint
scripts/capture-dataforseo-fixtures.ts          new  — operator fixture capture
src/app/api/cron/pull-keywords/route.ts         new  — scheduled entrypoint
.env.example                                    new  — all env keys, values blank
render.yaml                                     edit — DATAFORSEO_* + commented cron
package.json                                    edit — vitest devDep, 3 scripts
vitest.config.ts                                new  — path alias, node env
```

The split between `client.ts` (does I/O) and `parse.ts` (pure functions) is
what makes fixture tests possible without burning credit or mocking `fetch`.

---

## 3. Schema

Migration `0035_keyword_corpus.sql`, hand-written idempotent SQL matching the
style of `0028_client_keywords.sql`. Mirrored into `schema.ts` (uuid PKs with
`defaultRandom()`, `varchar` with explicit lengths, `timestamp().defaultNow()`).

**`keyword_seeds`** — the input list.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `seed` | varchar(200) | |
| `vertical` | varchar(64) | `peptides`, `body_kits`, `restaurant`, `loans`, … |
| `active` | boolean, default true | |
| `created_at` | timestamp | |

Unique on `(seed, vertical)`.

**`keyword_runs`** — one row per seed per run, for cost tracking and debugging.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `seed_id` | uuid fk → `keyword_seeds` | `ON DELETE SET NULL`, nullable — a run record outlives the seed |
| `endpoint` | varchar(120) | |
| `location_code` | integer | |
| `language_code` | varchar(16) | |
| `status` | enum `keyword_run_status` | `pending` / `success` / `failed` |
| `items_returned` | integer, default 0 | |
| `cost` | numeric(10,4) | DataForSEO costs are small fractions — 4dp, not 2 |
| `error` | text, nullable | |
| `started_at`, `finished_at` | timestamp | `finished_at` nullable |

The enum is created inside a `DO $$ … EXCEPTION WHEN duplicate_object THEN null; END $$;`
block, per the migrations README.

**`keywords`** — the corpus.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `keyword` | varchar(255) | |
| `location_code` | integer | |
| `language_code` | varchar(16) | |
| `search_volume` | integer, nullable | |
| `cpc` | numeric(10,2), nullable | null is normal — see §7 |
| `competition` | numeric(6,4), nullable | 0–1 |
| `low_top_of_page_bid`, `high_top_of_page_bid` | numeric(10,2), nullable | |
| `keyword_difficulty` | integer, nullable | |
| `main_intent` | varchar(32), nullable | |
| `monthly_searches` | jsonb, nullable | `[{year, month, search_volume}]` |
| `raw` | jsonb | the untouched API item |
| `source_endpoint` | varchar(120) | |
| `first_seen_at`, `last_updated_at` | timestamp | |

**Unique index on `(keyword, location_code, language_code)`** — this is the
idempotency key.

**`keyword_seed_links`** — `(keyword_id, seed_id)`, both fks with
`ON DELETE CASCADE`, composite pk. A keyword legitimately surfaces from several
seeds; this preserves which.

---

## 4. Client module — `services/dataforseo/client.ts`

Modeled on `embeddings-client.ts`.

- **Auth.** `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` from env, base64'd into
  `Authorization: Basic`. A `dataForSeoConfigured()` predicate mirrors
  `embeddingsConfigured()` so callers can degrade instead of throwing.
- **Request shape.** Every call posts a **JSON array of task objects**, even for
  one task. A bare object is rejected by the API — the function signatures take
  a single typed params object and do the array wrapping internally so a caller
  cannot get this wrong.
- **Dual status-code check.** `body.status_code` *and* `body.tasks[i].status_code`
  must both be `20000`. HTTP 200 with a failed task is a normal DataForSEO
  outcome. Failure throws `DataForSeoError` carrying `statusCode`,
  `statusMessage`, and which level failed.
- **Retry.** 3 attempts, base delay 1s, exponential with jitter, on HTTP 429 and
  5xx only. No retry on other 4xx — those are request bugs, retrying just burns
  time. Task-level failures are not retried either (a bad seed stays bad).
- **Cost.** Each call returns `{ items, cost, endpoint }` reading `tasks[].cost`
  so the runner can persist it.
- **Cost ceiling.** `DATAFORSEO_MAX_RUN_COST`, default `5.00`. Enforced in the
  runner, not the client, because it is a per-*run* budget: a `CostBudget` object
  is threaded through, each call adds to it, and the next call is refused once
  the ceiling is crossed. This means the ceiling can overshoot by at most one
  call's cost — genuinely preventing that would require pre-flight pricing the
  API does not expose.

One exported function per endpoint: `keywordSuggestions`, `keywordIdeas`,
`relatedKeywords`, `keywordsForKeywords`, plus `labsLocations` and
`googleAdsLocations` for the two separate location lists.

---

## 5. Runner and entrypoints

**`keyword-corpus-runner.ts`** — `runKeywordPull({ vertical, locationCode, languageCode, endpoint, minVolume, limit, maxCost })`.

1. Load active seeds for the vertical.
2. **Fan out one call per seed**, concurrency capped at 5 (matching
   `MAX_CONCURRENT_CRAWLS` in `render.yaml`; overridable by flag). Per-seed
   granularity gives per-seed cost and failure isolation, and
   `keyword_suggestions` takes one seed per task anyway.
3. Per seed: insert a `pending` run row → call → parse → upsert → update the row
   to `success` with `items_returned` and `cost`.
4. **A failed seed writes `failed` with the error and the loop continues.** Only
   a breached cost ceiling stops the run; remaining seeds are then marked
   `failed` with an explicit budget-exhausted message rather than left `pending`.
5. Returns a summary (seeds processed / succeeded / failed, keywords upserted,
   total cost) — logged by the script, returned as JSON by the route.

**Upsert.** `onConflictDoUpdate` on `(keyword, location_code, language_code)`,
setting the metric columns, `raw`, `source_endpoint`, and `last_updated_at`,
leaving `first_seen_at` untouched. Rows are chunked (~200 per statement) because
the Neon HTTP driver has no interactive transactions — each chunk is its own
statement, which is fine given the operation is idempotent by construction.

**`scripts/pull-keywords.ts`** — `npm run keywords:pull -- --vertical peptides --location-code 2840`.
Flags: `--vertical` (required), `--location-code` (default 2840), `--language-code`
(default `en`), `--endpoint` (default `keyword_suggestions`), `--min-volume`
(default `0` — see §7), `--limit`, `--max-cost`, `--concurrency`, `--dry-run`
(calls the API, prints what would be written, writes nothing).

**`/api/cron/pull-keywords`** — `verifyCronSecret` guard, same params from the
query string, `export const maxDuration = 300`, returns the summary as JSON.
Matches `refresh-keywords/route.ts` exactly in shape.

**`render.yaml`** gets the `DATAFORSEO_*` keys on the web service and a
**commented-out** cron service block with the exact incantation. Enabling a
recurring spend should be a deliberate uncomment, not a side effect of merging
this.

---

## 6. Fixtures and verification

No DataForSEO credentials are available in the build environment, so §8 of the
brief ("hit each endpoint, build types from the capture") cannot be completed by
the implementation commit. The plan is honest about that rather than pretending:

- `scripts/capture-dataforseo-fixtures.ts` hits each of the four endpoints once
  with a trivial payload plus both `/locations` lists, and writes raw JSON to
  `src/lib/services/dataforseo/fixtures/`. An operator with credentials runs it.
- Until then, fixtures are hand-written from the brief's documented shapes and
  the file header marks them `PROVISIONAL — regenerate with capture script`.
- **The parser is written to survive being wrong about the shape**: every
  extracted field is optional, missing paths yield `null` rather than throwing,
  unrecognized fields survive intact in `raw`, and a run where every item parses
  to all-nulls is surfaced in the summary as a likely shape mismatch instead of
  silently writing empty rows.
- Follow-up commit after capture: regenerate fixtures, tighten types to the real
  response, keep the null-tolerance.

Two verification items stay with the operator and are called out in the doc:
confirming `location_code` values against the live `/locations` endpoints for
*each* API (a stale code fails silently by returning national data), and
confirming current per-call pricing before trusting the `5.00` default ceiling.

**Tests** (`parse.test.ts`, vitest, no network): field extraction from a full
item; an item with every optional field absent; task-level failure detection;
envelope-level failure detection; cost extraction across multiple tasks; the
row-shape produced for upsert. `npm test` / `npm run test:watch`.

---

## 7. Vertical constraints encoded in the code

These are behavioural requirements from the brief, not preferences, so each gets
a comment at its enforcement point:

1. **Seed on compound names, not category terms.** `"peptides"` as a seed
   returns a corpus dominated by skincare intent. The seeding docs and the
   `keyword_seeds` header comment say so; one call per compound.
2. **Commercial metrics are unreliable for restricted verticals.** Google
   restricts ads on many research compounds, so `cpc`, `competition`, and the bid
   fields come back null or misleadingly low. They are stored, never filtered or
   sorted on. **Nulls here are expected and are not errors** — the parser does
   not warn on them.
3. **Zero volume is not absence of demand** for long-tail product+city terms.
   `--min-volume` defaults to **0** and no volume filter is sent to the API
   unless the flag is passed.

---

## 8. Explicitly not built

Per the brief: no UI or admin pages, no publishing-pipeline integration, no
content generation from keywords, no scoring/ranking/"opportunity" logic, no
rank or SERP tracking.

Nothing is imported from or modeled on the `research-a` or `nicheiq` repos — no
"opportunities", "niches", "trend sources", or scoring engine. Netgrid's own
pre-existing `niches` table is unrelated and untouched. This pipeline stores raw
keyword data and stops.

---

## 9. Definition of done

- [ ] `0035_keyword_corpus.sql` applied; three tables + join table present, unique index on `keywords`
- [ ] Client with auth, retry, **both** status codes checked, cost accumulation, run ceiling
- [ ] `npm run keywords:pull -- --vertical peptides --location-code 2840` populates `keywords` and `keyword_runs`
- [ ] Re-run is idempotent — no duplicate rows, `last_updated_at` advances, `first_seen_at` unchanged
- [ ] One failed seed does not abort the run; it writes a `failed` row with the error
- [ ] Vitest fixture tests on the parsing layer, green, no network
- [ ] `.env.example` created; `render.yaml` updated; cron service present but commented out
- [ ] No new **runtime** dependency (vitest is dev-only, approved)
- [ ] Nothing imported from or modeled on `research-a` / `nicheiq`
- [ ] Operator follow-up flagged: capture real fixtures, confirm location codes, confirm pricing
