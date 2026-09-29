import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type { TokenRepresentation, UnderlyingGroup } from "@orchard/rwa";

/**
 * Deterministic sample-set construction for the F001-B T3 quote feasibility
 * probe: every representation of every multi-representation ticker, plus a
 * seeded random sample of single-representation tickers per platform.
 *
 * Pure and seeded - the same universe and the same seed always produce the
 * same sample, so a run is reproducible (F001B-spec.md T3).
 */

/**
 * mulberry32 seeded from sha256(seed). A named, fixed algorithm rather than
 * Math.random: reproducibility is the requirement, cryptographic quality is
 * not.
 */
export function seededRandom(seed: string): () => number {
  const digest = createHash("sha256").update(seed).digest();
  let state = digest.readUInt32BE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates using the supplied generator. Input is copied, never mutated.
 * Callers must pass an already stably-sorted list so the result depends only
 * on the seed, not on provider response ordering.
 */
export function seededShuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export interface SampleSetOptions {
  /** Seed string for the single-representation draw. Recorded in the report. */
  seed: string;
  /** Single-representation tickers to draw per platform. Default 10 (spec T3: 10 Ondo, 10 bStock). */
  singleRepPerPlatform?: number;
}

export interface SampleSet {
  seed: string;
  singleRepPerPlatform: number;
  /** Every representation of every ticker that has more than one. */
  multiRepresentation: TokenRepresentation[];
  /** The seeded draw from tickers with exactly one representation. */
  singleRepresentation: TokenRepresentation[];
  /** multiRepresentation then singleRepresentation, the order the probe walks. */
  all: TokenRepresentation[];
  multiRepresentationTickers: string[];
  /** Platforms that had fewer single-rep tickers than requested, and how many were available. */
  shortfalls: { platformId: string; requested: number; available: number }[];
}

const DEFAULT_SINGLE_REP_PER_PLATFORM = 10;

/** Stable ordering key: chain, then contract address. Independent of provider response order. */
function representationKey(rep: TokenRepresentation): string {
  return `${rep.binanceChainId}:${rep.tokenContractAddress}`;
}

export function buildSampleSet(
  groups: ReadonlyMap<string, UnderlyingGroup>,
  options: SampleSetOptions,
): SampleSet {
  const singleRepPerPlatform = options.singleRepPerPlatform ?? DEFAULT_SINGLE_REP_PER_PLATFORM;

  const multiTickers: string[] = [];
  const multiReps: TokenRepresentation[] = [];
  const singleByPlatform = new Map<string, TokenRepresentation[]>();

  for (const ticker of [...groups.keys()].sort()) {
    const group = groups.get(ticker)!;
    const reps = [...group.representations].sort((a, b) =>
      representationKey(a).localeCompare(representationKey(b)),
    );
    if (reps.length > 1) {
      multiTickers.push(ticker);
      multiReps.push(...reps);
      continue;
    }
    const only = reps[0];
    if (only === undefined) continue;
    const list = singleByPlatform.get(only.platformId) ?? [];
    list.push(only);
    singleByPlatform.set(only.platformId, list);
  }

  const random = seededRandom(options.seed);
  const singleReps: TokenRepresentation[] = [];
  const shortfalls: SampleSet["shortfalls"] = [];
  // Platforms in sorted order so the draw order itself is deterministic.
  for (const platformId of [...singleByPlatform.keys()].sort()) {
    const candidates = singleByPlatform.get(platformId)!;
    if (candidates.length < singleRepPerPlatform) {
      shortfalls.push({
        platformId,
        requested: singleRepPerPlatform,
        available: candidates.length,
      });
    }
    singleReps.push(...seededShuffle(candidates, random).slice(0, singleRepPerPlatform));
  }

  return {
    seed: options.seed,
    singleRepPerPlatform,
    multiRepresentation: multiReps,
    singleRepresentation: singleReps,
    all: [...multiReps, ...singleReps],
    multiRepresentationTickers: multiTickers,
    shortfalls,
  };
}

/**
 * Converts a whole-USD spend size to the spend token's smallest unit, exactly.
 * decimal.js only, never a float (AGENTS.md). Throws rather than silently
 * truncating if the result is not a whole number of smallest units.
 */
export function usdToSmallestUnit(usd: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`spend token decimals must be a non-negative integer, got ${decimals}`);
  }
  const scaled = new Decimal(usd).times(new Decimal(10).pow(decimals));
  if (!scaled.isInteger()) {
    throw new Error(
      `spend size ${usd} is not expressible in whole smallest units at ${decimals} decimals`,
    );
  }
  return scaled.toFixed(0);
}
