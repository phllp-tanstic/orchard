import type { Decimal } from "decimal.js";
import type { AssetType, Token } from "./schemas.js";
import { impliedPricePerShare, ratioAnomalyReason } from "./normalize.js";

export interface TokenRepresentation {
  binanceChainId: string;
  tokenContractAddress: string;
  platformId: string;
  underlyingTicker: string;
  underlyingName: string;
  assetType: AssetType;
  tokenToShareRatio: string;
  tokenPrice: string;
  referencePrice: string;
  /** DEC-020: confirmed live null on the tokens endpoint - never excluded, just carried through. */
  marketStatus: string | null;
  /** undefined when tokenToShareRatio failed validation - see ratioAnomalyReason below. */
  impliedPricePerShare: Decimal | undefined;
  /** Set when tokenToShareRatio is empty, non-numeric, zero, or negative - never thrown. */
  ratioAnomalyReason: string | undefined;
}

/** A token whose assetType and underlyingName are known non-null - the only kind toRepresentation accepts. */
export type CompleteToken = Token & { assetType: AssetType; underlyingName: string };

export type IncompleteTokenField = "assetType" | "underlyingName";

export interface IncompleteTokenReason {
  platformId: string;
  tokenContractAddress: string;
  tokenSymbol: string;
  nullFields: IncompleteTokenField[];
}

/**
 * DEC-020: a token with a null assetType or underlyingName can't be
 * meaningfully grouped or typed - confirmed live on the tokens endpoint (see
 * docs/DEVEX_LOG.md). Splits tokens into ones safe to build a
 * TokenRepresentation from and ones to report as incomplete instead
 * (data-quality observation, not a fail-closed condition).
 */
export function partitionCompleteTokens(tokens: readonly Token[]): {
  complete: CompleteToken[];
  incomplete: IncompleteTokenReason[];
} {
  const complete: CompleteToken[] = [];
  const incomplete: IncompleteTokenReason[] = [];
  for (const token of tokens) {
    const nullFields: IncompleteTokenField[] = [];
    if (token.assetType === null) nullFields.push("assetType");
    if (token.underlyingName === null) nullFields.push("underlyingName");
    if (nullFields.length > 0) {
      incomplete.push({
        platformId: token.platformId,
        tokenContractAddress: token.tokenContractAddress,
        tokenSymbol: token.tokenSymbol,
        nullFields,
      });
    } else {
      complete.push(token as CompleteToken);
    }
  }
  return { complete, incomplete };
}

export function toRepresentation(token: CompleteToken): TokenRepresentation {
  const anomaly = ratioAnomalyReason(token.tokenToShareRatio);
  return {
    binanceChainId: token.binanceChainId,
    tokenContractAddress: token.tokenContractAddress,
    platformId: token.platformId,
    underlyingTicker: token.underlyingTicker,
    underlyingName: token.underlyingName,
    assetType: token.assetType,
    tokenToShareRatio: token.tokenToShareRatio,
    tokenPrice: token.tokenPrice,
    referencePrice: token.referencePrice,
    marketStatus: token.statusInfo.marketStatus,
    impliedPricePerShare:
      anomaly === undefined
        ? impliedPricePerShare(token.tokenPrice, token.tokenToShareRatio)
        : undefined,
    ratioAnomalyReason: anomaly,
  };
}

export interface FieldConflict {
  field: "underlyingName" | "assetType";
  values: Array<{ value: unknown; binanceChainId: string; tokenContractAddress: string }>;
}

export interface UnderlyingGroup {
  underlyingTicker: string;
  representations: TokenRepresentation[];
  conflicts: FieldConflict[];
}

/**
 * Groups strictly by the explicit `underlyingTicker` field - never derived
 * from a token symbol (spec T4 step 4). Flags conflicting `underlyingName`
 * or `assetType` values within a ticker group.
 */
export function groupByUnderlyingTicker(
  representations: readonly TokenRepresentation[],
): Map<string, UnderlyingGroup> {
  const groups = new Map<string, UnderlyingGroup>();
  for (const rep of representations) {
    let group = groups.get(rep.underlyingTicker);
    if (!group) {
      group = { underlyingTicker: rep.underlyingTicker, representations: [], conflicts: [] };
      groups.set(rep.underlyingTicker, group);
    }
    group.representations.push(rep);
  }
  for (const group of groups.values()) {
    group.conflicts = detectConflicts(group.representations);
  }
  return groups;
}

function detectConflicts(representations: readonly TokenRepresentation[]): FieldConflict[] {
  const conflicts: FieldConflict[] = [];
  for (const field of ["underlyingName", "assetType"] as const) {
    const distinct = new Set(representations.map((r) => r[field]));
    if (distinct.size > 1) {
      conflicts.push({
        field,
        values: representations.map((r) => ({
          value: r[field],
          binanceChainId: r.binanceChainId,
          tokenContractAddress: r.tokenContractAddress,
        })),
      });
    }
  }
  return conflicts;
}

export function multiRepresentationTickers(groups: ReadonlyMap<string, UnderlyingGroup>): string[] {
  return [...groups.values()]
    .filter((g) => g.representations.length > 1)
    .map((g) => g.underlyingTicker)
    .sort();
}
