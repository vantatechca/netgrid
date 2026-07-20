// OpenAI embeddings client for netgrid's semantic-linking engine.
//
// Anthropic (the app's content model) has no embeddings endpoint, so vectors
// come from OpenAI's `text-embedding-3-small` (1536 dims). The base URL and
// model are env-overridable so a self-hosted, OpenAI-compatible endpoint can
// be swapped in without code changes.
//
// Design goals mirror the rest of the service layer: never throw an unhandled
// error into a request path (callers get a typed failure), and back off on
// rate limits / transient 5xx instead of hammering the API.

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";

/** Dimension of `text-embedding-3-small`. Must match the pgvector column. */
export const EMBEDDING_DIMENSIONS = 1536;

// text-embedding-3-small accepts up to 8191 tokens. We cap on characters
// (~4 chars/token heuristic, generously under the limit) so a huge article
// body can't blow the request; the tail of a long post rarely changes its
// topical embedding anyway.
const MAX_INPUT_CHARS = 24000;

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;

export function embeddingsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function baseUrl(): string {
  return (process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function embeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_MODEL;
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OpenAiEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

/**
 * Embed one or more strings in a single request. Returns one vector per input,
 * in input order. Throws `EmbeddingError` only after exhausting retries or on a
 * non-retryable error — callers are expected to catch and degrade gracefully.
 */
export async function generateEmbeddings(inputs: string[]): Promise<number[][]> {
  if (!embeddingsConfigured()) {
    throw new EmbeddingError("OPENAI_API_KEY is not configured");
  }
  const cleaned = inputs.map((t) => t.slice(0, MAX_INPUT_CHARS));
  if (cleaned.length === 0) return [];

  const url = `${baseUrl()}/embeddings`;
  const model = embeddingModel();

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({ model, input: cleaned }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      // Retry on rate limit / transient server errors with backoff.
      if (res.status === 429 || res.status >= 500) {
        lastError = new EmbeddingError(
          `Embedding API returned ${res.status}`,
          res.status,
        );
        if (attempt < MAX_RETRIES) {
          await sleep(BASE_BACKOFF_MS * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        let detail = "";
        try {
          const body = (await res.json()) as OpenAiEmbeddingResponse;
          detail = body.error?.message ?? "";
        } catch {
          // ignore body parse failure
        }
        throw new EmbeddingError(
          `Embedding API error ${res.status}${detail ? `: ${detail}` : ""}`,
          res.status,
        );
      }

      const body = (await res.json()) as OpenAiEmbeddingResponse;
      const rows = body.data ?? [];
      if (rows.length !== cleaned.length) {
        throw new EmbeddingError(
          `Embedding API returned ${rows.length} vectors for ${cleaned.length} inputs`,
        );
      }
      // Preserve input order (API returns an `index` on each row).
      const out: number[][] = new Array(cleaned.length);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const vec = row.embedding;
        if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
          throw new EmbeddingError(
            `Embedding ${i} had ${vec?.length ?? 0} dims, expected ${EMBEDDING_DIMENSIONS}`,
          );
        }
        out[row.index ?? i] = vec;
      }
      return out;
    } catch (err) {
      lastError = err;
      // AbortError / network error → retry; typed non-retryable errors bubble.
      const retryable =
        !(err instanceof EmbeddingError) ||
        err.status === undefined ||
        err.status === 429 ||
        err.status >= 500;
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
        continue;
      }
      throw err instanceof EmbeddingError
        ? err
        : new EmbeddingError(
            err instanceof Error ? err.message : "Embedding request failed",
          );
    }
  }
  throw lastError instanceof EmbeddingError
    ? lastError
    : new EmbeddingError("Embedding request failed after retries");
}

/** Embed a single string. Convenience wrapper over `generateEmbeddings`. */
export async function generateEmbedding(input: string): Promise<number[]> {
  const [vec] = await generateEmbeddings([input]);
  return vec;
}
