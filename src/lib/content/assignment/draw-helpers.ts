import crypto from "crypto";

/**
 * Seeded PRNG so the same `seed` produces the same draw — important for
 * reproducibility when an admin wants to re-run an assignment from a known
 * point. xorshift32 is fine for this use case (we don't need crypto-grade
 * randomness, just stable variation).
 */
export class SeededRng {
  private state: number;

  constructor(seed: string | number) {
    if (typeof seed === "string") {
      const hash = crypto.createHash("md5").update(seed).digest();
      this.state = hash.readUInt32LE(0) || 0xdeadbeef;
    } else {
      this.state = seed >>> 0 || 0xdeadbeef;
    }
  }

  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }

  /** Integer in [min, max] inclusive. */
  intBetween(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Random element from an array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error("SeededRng.pick: empty array");
    }
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Shuffle (Fisher-Yates) — returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/**
 * Weighted sample. `weights` may include zero or negative entries — those are
 * treated as zero. Returns undefined only if total weight is zero.
 */
export function weightedSample<T>(
  rng: SeededRng,
  items: readonly T[],
  weights: readonly number[],
): T | undefined {
  if (items.length !== weights.length) {
    throw new Error("weightedSample: items and weights length mismatch");
  }
  const safeWeights = weights.map((w) => (w > 0 ? w : 0));
  const total = safeWeights.reduce((sum, w) => sum + w, 0);
  if (total === 0) return undefined;

  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= safeWeights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Balanced sample — combines a base weight with a usage-decay so already-
 * over-represented items get picked less. `decayFactor` controls how
 * aggressively usage suppresses weight (0.5 = strong, 0.9 = mild).
 *
 *   effective_weight = base_weight * decayFactor ^ usage_count
 */
export function balancedSample<T>(
  rng: SeededRng,
  items: readonly T[],
  baseWeights: readonly number[],
  usages: readonly number[],
  decayFactor: number,
): T | undefined {
  const adjusted = baseWeights.map((bw, i) => bw * Math.pow(decayFactor, usages[i] || 0));
  return weightedSample(rng, items, adjusted);
}

/**
 * Uniform balanced sample where every item has equal base weight. Just defers
 * to balancedSample with weights all 1.
 */
export function balancedSampleUniform<T>(
  rng: SeededRng,
  items: readonly T[],
  usageGetter: (item: T) => number,
  decayFactor: number,
): T | undefined {
  const weights = items.map(() => 1);
  const usages = items.map(usageGetter);
  return balancedSample(rng, items, weights, usages, decayFactor);
}

/** Pick N distinct items from `items`. Throws if N > items.length. */
export function pickN<T>(
  rng: SeededRng,
  items: readonly T[],
  n: number,
): T[] {
  if (n > items.length) {
    throw new Error(`pickN: requested ${n} but only ${items.length} available`);
  }
  return rng.shuffle(items).slice(0, n);
}
