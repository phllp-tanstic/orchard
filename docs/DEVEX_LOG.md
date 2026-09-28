# DevEx Log

Entry template from `docs/ORCHARD_PRODUCTION_BLUEPRINT.md` section 16, with an added `Author`
field.

Agents may capture raw tool observations only. Narrative entries are written by the owner
(see `AGENTS.md`).

## Entry template

```text
Timestamp:
Author:
Developer:
Docs URL/page:
Operation:
Goal:
Expected:
Observed:
HTTP/provider code:
Latency:
Workaround:
Was docs behavior accurate?:
Suggested fix:
Evidence ref:
```

## Entries

### 2026-09-27

```text
Timestamp: 2026-09-27T00:15:11.526Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List, statusInfo.marketStatus)
Operation: GET /api/v1/dex/market/rwa/tokens (binanceChainId=56, platformId=ondo)
Goal: -
Expected: statusInfo.marketStatus one of the documented enum values (premarket | regular | postmarket | overnight | closed | pause)
Observed: statusInfo.marketStatus = "offhours" on 31 of the tokens in this response (e.g. underlyingTicker NVDA, AAPL, TSLA, MSFT, AMZN, META, GOOGL)
HTTP/provider code: 200 / "0"
Latency: 1524ms
Workaround: -
Was docs behavior accurate?: No - "offhours" is not in the documented marketStatus enum.
Suggested fix: -
Evidence ref: evidence.provider_call.id = 7f22e069-4cb0-47ae-b09b-a8e41cba0381, probe_run_id = e2e78fa9-6ff2-4daa-877b-592439128c5e
```

### 2026-09-28 (DEC-020)

```text
Timestamp: 2026-09-27T00:15:12.085Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List, statusInfo.marketStatus)
Operation: GET /api/v1/dex/market/rwa/tokens (binanceChainId=56, platformId=bstock)
Goal: -
Expected: statusInfo.marketStatus one of the documented enum values (premarket | regular | postmarket | overnight | offhours | closed | pause)
Observed: statusInfo.marketStatus = null on all 46 tokens in this response (e.g. underlyingTicker CRCL)
HTTP/provider code: 200 / "0"
Latency: 561ms
Workaround: -
Was docs behavior accurate?: No - null is not in the documented marketStatus enum.
Suggested fix: -
Evidence ref: evidence.provider_call.id = cbf81217-d651-4e5f-83c2-14b88c472b7f, probe_run_id = e2e78fa9-6ff2-4daa-877b-592439128c5e
```

```text
Timestamp: 2026-09-27T00:15:11.526Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List, assetType)
Operation: GET /api/v1/dex/market/rwa/tokens (binanceChainId=56, platformId=ondo)
Goal: -
Expected: assetType one of the documented values (1 | 2 | 3)
Observed: assetType = null on 3 of the tokens in this response (tokenContractAddress 0xebe1408a7cce4f38de15467e5139c3d82e4641f8 / underlyingTicker SYSB, 0xb0d7d4b65a654d43f91272bb94e011ce6812a2ef / SECU, 0x85b53a9344884ae428e0e15f05a1819d280d4be7 / HYGW)
HTTP/provider code: 200 / "0"
Latency: 1524ms
Workaround: -
Was docs behavior accurate?: No - null is not in the documented assetType values.
Suggested fix: -
Evidence ref: evidence.provider_call.id = 7f22e069-4cb0-47ae-b09b-a8e41cba0381, probe_run_id = e2e78fa9-6ff2-4daa-877b-592439128c5e
```

```text
Timestamp: 2026-09-27T00:15:11.526Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List, underlyingName)
Operation: GET /api/v1/dex/market/rwa/tokens (binanceChainId=56, platformId=ondo)
Goal: -
Expected: underlyingName a non-null string
Observed: underlyingName = null on the same 3 tokens as the assetType observation above (tokenContractAddress 0xebe1408a7cce4f38de15467e5139c3d82e4641f8 / underlyingTicker SYSB, 0xb0d7d4b65a654d43f91272bb94e011ce6812a2ef / SECU, 0x85b53a9344884ae428e0e15f05a1819d280d4be7 / HYGW)
HTTP/provider code: 200 / "0"
Latency: 1524ms
Workaround: -
Was docs behavior accurate?: No - underlyingName is documented as a string, not nullable.
Suggested fix: -
Evidence ref: evidence.provider_call.id = 7f22e069-4cb0-47ae-b09b-a8e41cba0381, probe_run_id = e2e78fa9-6ff2-4daa-877b-592439128c5e
```

### 2026-09-28 (DEC-021 - comprehensive audit of all stored /rwa/tokens responses)

```text
Timestamp: 2026-09-28T00:13:06.462Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List, statusInfo.marketStatus)
Operation: GET /api/v1/dex/market/rwa/tokens (binanceChainId=56, platformId=ondo)
Goal: -
Expected: statusInfo.marketStatus one of the documented enum values (premarket | regular | postmarket | overnight | offhours | closed | pause)
Observed: statusInfo.marketStatus = "paused" on 92 of the tokens in this response (e.g. tokenContractAddress 0x47b36ddb9dd12a8411f78226f55e8c3f0d65481f). Also observed in this same audit: across all 976 tokens captured so far (both probe runs, both platforms), the documented value "pause" (singular) has never once appeared - only "paused".
HTTP/provider code: 200 / "0"
Latency: 1384ms
Workaround: -
Was docs behavior accurate?: No - "paused" is not in the documented marketStatus enum; the closest documented value, "pause", has zero live occurrences across every stored response.
Suggested fix: -
Evidence ref: evidence.provider_call.id = f4192f57-f42d-461e-9706-283e30729d8d, probe_run_id = 3ffea1da-004d-4a2d-b0ec-1639aceee3f5
```

```text
Timestamp: 2026-09-27T00:15:12.085Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List, marketCap)
Operation: GET /api/v1/dex/market/rwa/tokens (binanceChainId=56, platformId=bstock)
Goal: -
Expected: marketCap a non-null string
Observed: marketCap = null on at least one token in this response (tokenContractAddress 0x0bb3fa77e0809f42948e435f04883c25415e8263)
HTTP/provider code: 200 / "0"
Latency: 561ms
Workaround: -
Was docs behavior accurate?: No - marketCap is documented as a string, not nullable.
Suggested fix: -
Evidence ref: evidence.provider_call.id = cbf81217-d651-4e5f-83c2-14b88c472b7f, probe_run_id = e2e78fa9-6ff2-4daa-877b-592439128c5e
```

### 2026-09-28 (DEC-022 - token-count reconciliation investigation)

```text
Timestamp: 2026-09-28T19:23:18.458Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List vs Search RWA Token)
Operation: GET /api/v1/dex/market/rwa/search?binanceChainId=56&keyword=f&platformId=bstock, cross-checked against GET /api/v1/dex/market/rwa/tokens?platformId=bstock made 76 seconds earlier in the same session
Goal: -
Expected: every token /rwa/search can find for a platform+chain should also appear in /rwa/tokens for that same platform+chain
Observed: ticker NFLX / tokenSymbol NFLXB / tokenContractAddress 0xd6829ea836b6fa224d099d40e54b31262f874631 (platformId bstock, binanceChainId 56) is returned by /rwa/search but absent from the 46-row response of /rwa/tokens?platformId=bstock made in the same session (confirmed by direct address comparison, not assumed). 17 such addresses found for bstock and 4 for ondo via a single-character a-z/0-9 keyword sweep (21 total, of a possible larger population - the search index itself does not appear to be exhaustively sampled by that keyword set either, see below).
HTTP/provider code: 200 / "0"
Latency: 484ms
Workaround: -
Was docs behavior accurate?: Unclear - neither endpoint's doc page states that /rwa/tokens is guaranteed to list every token /rwa/search can surface for the same platform+chain.
Suggested fix: -
Evidence ref: evidence.provider_call.id = 0d1e0d6a-cd82-43c3-b4ce-33f2149de37b (search hit), f269f105-a907-4d42-a12d-a1eeec41d88b (tokens call missing it), probe_run_id = 82d4d803-4b4e-4474-9309-2cfdabb4e161
```

```text
Timestamp: 2026-09-28T19:23:02.149Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Search RWA Token)
Operation: GET /api/v1/dex/market/rwa/search?binanceChainId=56&keyword=z&platformId=ondo
Goal: -
Expected: -
Observed: ticker HTZ / tokenSymbol HTZon / tokenContractAddress 0xb18c6a83490dddbc9a83b011173b5b2fb5dc1272 (platformId ondo) returned by /rwa/search but absent from /rwa/tokens?platformId=ondo made in the same session (442 rows, address confirmed absent).
HTTP/provider code: 200 / "0"
Latency: 644ms
Workaround: -
Was docs behavior accurate?: Unclear - see the bstock/NFLX entry above; same phenomenon on the ondo platform.
Suggested fix: -
Evidence ref: evidence.provider_call.id = f5c5a7e6-6a1e-40f1-8d29-6013e3f1e1d7, probe_run_id = 82d4d803-4b4e-4474-9309-2cfdabb4e161
```

```text
Timestamp: 2026-09-28T19:22:21.975Z to 19:22:42.804Z (spans the tabId 1-13 sweep)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List, tabId parameter, documented "1-13 for sector filters")
Operation: GET /api/v1/dex/market/rwa/tokens?binanceChainId=56&platformId=<ondo|bstock>&tabId=<1..13> (26 calls, all 13 values, both platforms)
Goal: -
Expected: different tabId values selecting different sector subsets, per the documented "sector filter" semantics
Observed: every tabId value 1 through 13 returned exactly the same row count as the tabId-less call for that platform (442 for ondo, 46 for bstock, every time) - no new addresses found across the full sweep. Not a filtering mechanism as far as this parameter's effect on this endpoint/platform pair is concerned.
HTTP/provider code: 200 / "0" (all 26 calls)
Latency: -
Workaround: -
Was docs behavior accurate?: Unclear - tabId did not visibly filter anything in this test; whether it requires a different parameter combination, or is simply inert for these platforms, is not established.
Suggested fix: -
Evidence ref: probe_run_id = 82d4d803-4b4e-4474-9309-2cfdabb4e161 (26 provider_call rows, endpoint LIKE '%/rwa/tokens%tabId=%')
```

```text
Timestamp: 2026-09-28T19:22:43.530Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Search RWA Token, "keyword (ticker, company name, or contract address)" - matching mode undocumented)
Operation: GET /api/v1/dex/market/rwa/search?keyword=NVD&binanceChainId=56 and GET .../search?keyword=VDA&binanceChainId=56
Goal: -
Expected: -
Observed: both keyword="NVD" (a prefix of "NVDA") and keyword="VDA" (a substring of "NVDA" that is not a prefix) matched ticker NVDA. Matching is substring, not prefix-only.
HTTP/provider code: 200 / "0" (both calls)
Latency: -
Workaround: -
Was docs behavior accurate?: Partially - the doc names what fields are searched but not the matching mode; this establishes it empirically.
Suggested fix: -
Evidence ref: probe_run_id = 82d4d803-4b4e-4474-9309-2cfdabb4e161 (endpoint LIKE '%/rwa/search?keyword=NVD%' and '%/rwa/search?keyword=VDA%')
```

```text
Timestamp: 2026-09-28T18:08:44.894Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Underlying Market Data - not previously used anywhere in this codebase)
Operation: GET /api/v1/dex/market/rwa/underlying-market?binanceChainId=56&tokenContractAddress=<3 ondo + 3 bstock tokens>
Goal: -
Expected: -
Observed: endpoint responds 200/"0" for all 6 tokens tried, with a statusInfo object shaped like the one on /rwa/tokens plus a separate marketData object (referencePrice, high52W, low52W, volumeShares24H, marketCap, etc.). All 3 bstock tokens returned statusInfo.marketStatus = null (consistent with the /rwa/tokens finding already recorded above); all 3 ondo tokens returned "regular".
HTTP/provider code: 200 / "0" (all 6 calls)
Latency: -
Workaround: -
Was docs behavior accurate?: Partially - the endpoint exists and responds as generally described; marketStatus nullability is not documented there either, same gap as /rwa/tokens.
Suggested fix: -
Evidence ref: probe_run_id = bf41f9b3-faa2-441e-a865-5d6a9df08d08 (endpoint LIKE '%/rwa/underlying-market%', 6 provider_call rows) - captured by an earlier live probe run, re-confirmed structurally in probe_run_id = 82d4d803-4b4e-4474-9309-2cfdabb4e161
```

```text
Timestamp: 2026-09-28T19:22:17.699Z to 19:23:48.920Z (spans full investigation session, 140 calls)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (response envelope: code, data, msg, timestamp, success documented; no pagination/total/truncated/next documented)
Operation: all ~140 calls made in probe_run_id 82d4d803-4b4e-4474-9309-2cfdabb4e161 (tokens variants, tabId sweep, search enumeration, underlying-market)
Goal: -
Expected: -
Observed: every response envelope's top-level keys, across every endpoint tested, were exactly the documented set {code, data, msg, success, timestamp} - no pagination, total, truncated, or next key was ever observed. HTTP response headers beyond the x-oc-ratelimit-* subset already captured by packages/binance's client are not visible through evidence.provider_call and were not inspected further (out of scope for an ASSESS-only investigation that must not touch packages/binance/src).
HTTP/provider code: 200 / "0" (all calls, plus one 40382 "no matching" case treated as a documented-shape exception in this investigation's own script, not the client)
Latency: -
Workaround: -
Was docs behavior accurate?: Yes for the envelope keys actually observed; no evidence found of undocumented pagination fields.
Suggested fix: -
Evidence ref: probe_run_id = 82d4d803-4b4e-4474-9309-2cfdabb4e161 (all rows)
```
