/**
 * Lightweight, dependency-free near-duplicate detection for post titles/
 * topics. ideateTopic's only defense against repetition used to be a prompt
 * instruction ("don't overlap with recent titles") with nothing checking the
 * model's actual output — a reworded near-duplicate ("BPC-157 vs TB-500" vs
 * "BPC-157 TB500 Cost in Toronto") sailed straight through. This gives the
 * retry loop in ideateTopic something real to check against.
 *
 * Jaccard similarity over normalized, stopword-filtered word sets — good
 * enough to catch "same entities, reworded angle" without needing an
 * embedding call. English + French stopwords since blogs can be either.
 */

const STOPWORDS = new Set([
  // English
  "a", "an", "the", "for", "to", "in", "of", "and", "or", "how", "much",
  "take", "guide", "best", "buy", "what", "is", "are", "your", "you", "with",
  "on", "at", "by", "from", "vs", "which", "when", "where", "why", "do",
  "does", "can", "should", "this", "that", "it", "as", "be", "not",
  // French
  "le", "la", "les", "de", "des", "du", "au", "aux", "en", "pour", "et",
  "ou", "comment", "combien", "prendre", "votre", "vous", "avec", "sur",
  "est", "sont", "que", "qui", "où", "quel", "quelle", "un", "une", "dans",
  "ce", "cette",
]);

/** "BPC-157" and "TB-500" fuse into single tokens (bpc157, tb500) so a
 * compound name isn't accidentally split into two separate words. */
function tokenize(title: string): Set<string> {
  const normalized = title.toLowerCase().replace(/-/g, "");
  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/** Jaccard similarity (0-1) between two titles' significant-word sets. */
export function titleSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarTitleMatch {
  title: string;
  score: number;
}

/** The most-similar entry in `titles` that meets `threshold`, or undefined. */
export function findMostSimilarTitle(
  topic: string,
  titles: string[],
  threshold = 0.4,
): SimilarTitleMatch | undefined {
  let best: SimilarTitleMatch | undefined;
  for (const title of titles) {
    const score = titleSimilarity(topic, title);
    if (score >= threshold && (!best || score > best.score)) {
      best = { title, score };
    }
  }
  return best;
}
