import type { Decimal } from "decimal.js";
import type { AssetType, Token } from "./schemas.js";
import { impliedPricePerShare } from "./normalize.js";

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
  marketStatus: string;
  impliedPricePerShare: Decimal;
}

export function toRepresentation(token: Token): TokenRepresentation {
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
    impliedPricePerShare: impliedPricePerShare(token.tokenPrice, token.tokenToShareRatio),
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
