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

### 2026-09-28 (DEC-024 - /rwa/price batch size)

```text
Timestamp: 2026-09-28T18:09:47.510Z to 20:46:21.191Z (two live probe runs before this fix)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token Price, tokenContractAddresses - documented cap 100 addresses per call; no documented URL-length limit)
Operation: GET /api/v1/dex/market/rwa/price?binanceChainId=56&tokenContractAddresses=<100 addresses> (12 occurrences across 2 probe runs, all with a ~4573-character request path+query)
Goal: -
Expected: a 100-address batch (PRICE_BATCH_MAX, packages/rwa's documented cap) to succeed
Observed: every 100-address batch returned HTTP 414 (Request-URI Too Long), zero-byte body. Under the pre-fix client (this session's item 1), each 414 was retried maxRetries (3) times before the batch failed outright - 12 recorded attempts across 2 runs is 4 logical batch calls x 3 attempts each. The one smaller remainder batch in each run (85 addresses, ~3898-char request) succeeded with HTTP 200.
HTTP/provider code: 414 / null (all 12), 200 / "0" (the 2 remainder-batch calls)
Latency: -
Workaround: -
Was docs behavior accurate?: No - the documented 100-address cap is not actually usable; the provider's own URL-length limit is stricter and undocumented.
Suggested fix: see below (read-only sweep + configurable default).
Evidence ref: evidence.provider_call.id = 5debc1ea-37b4-4aea-b916-0e6a5f960659 (first 414), 6a837504-3b6c-41cb-9f21-cffbfa761fb2 (the 85-address 200), probe_run_id = bf41f9b3-faa2-441e-a865-5d6a9df08d08
```

```text
Timestamp: 2026-09-28T21:01:40.838Z to 21:01:43.235Z (read-only sweep, this fix)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token Price)
Operation: GET /api/v1/dex/market/rwa/price?binanceChainId=56&tokenContractAddresses=<N addresses>, N = 20, 40, 60, 80, 100 (5 calls, real ondo-platform chain-56 addresses)
Goal: -
Expected: -
Observed: 20/40/60/80 addresses all returned HTTP 200; 100 addresses returned HTTP 414 (content-length 0), reproducing the finding above on demand. 80 is the largest of the 5 tested sizes that succeeds.
HTTP/provider code: 200 / "0" (20, 40, 60, 80), 414 / null (100)
Latency: -
Workaround: tools/probe/src/pipeline.ts's /rwa/price batching now defaults to 80 (DEFAULT_PRICE_BATCH_SIZE), configurable via RunProbeDeps.priceBatchSize, instead of the documented-but-unusable PRICE_BATCH_MAX (100).
Was docs behavior accurate?: No - see above.
Suggested fix: implemented (this commit).
Evidence ref: probe_run_id = 300b6de4-229b-4859-a689-789c5f49e811 (5 provider_call rows, endpoint LIKE '%/rwa/price%')
```

### 2026-09-28 (referencePrice bps outliers - ASSESS only, no decision number assigned)

```text
Timestamp: 2026-09-28T22:51:09.210Z (tokens list) / 2026-09-28T22:51:50.340Z (price)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List; Get RWA Token Price)
Operation: stored responses for ondo 0xfc263946439b0d802bf4c5a6fcd34e2885259f91 (KLAC), read back from evidence.provider_call
Goal: -
Expected: -
Observed: raw field values exactly as received. /rwa/tokens entry: decimals "18", tokenToShareRatio "10.026064925604903975", tokenPrice "19031.667350173495423663139671929525", referencePrice "1898.219041208259". /rwa/price entry: tokenPrice "1898.219041208258939443", referencePrice "189.328421", tokenPriceUpdatedAt 1790635909400 (2026-09-28T22:51:49.400Z, 0.94s before the price call). Derived from those raw values: price.tokenPrice / price.referencePrice = 10.0260649256 = tokenToShareRatio; list.tokenPrice / list.referencePrice = 10.0260649256 = tokenToShareRatio; bps(price.referencePrice vs price.tokenPrice) = -9002.5997.
HTTP/provider code: 200 / "0"
Latency: -
Workaround: -
Was docs behavior accurate?: Unclear - neither endpoint's doc page states the unit (per token vs per underlying share) of tokenPrice or referencePrice.
Suggested fix: -
Evidence ref: evidence.provider_call.id = 9709995e-febc-46d2-b7ae-6b0274ea5c56 (tokens list), 2ea05d39-e84c-45a5-9248-6ed032400459 (price), probe_run_id = 634f558e-d77d-42eb-aed3-b5e33ca84f1b
```

```text
Timestamp: 2026-09-28T22:51:09.210Z (tokens list) / 2026-09-28T22:51:52.734Z (price)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List; Get RWA Token Price)
Operation: stored responses for ondo 0x5a9d924fc336a5ec8cf3b1909aa660533b50b015 (ENLV), read back from evidence.provider_call
Goal: -
Expected: -
Observed: raw field values exactly as received. /rwa/tokens entry: decimals "18", tokenToShareRatio "0.066667", tokenPrice "0.002318440962013516", referencePrice "0.034776440548". /rwa/price entry: tokenPrice "0.034776440548", referencePrice "0.521644", tokenPriceUpdatedAt 1790635907235 (2026-09-28T22:51:47.235Z, 5.5s before the price call). Derived from those raw values: price.tokenPrice / price.referencePrice = 0.066667 = tokenToShareRatio; list.tokenPrice / list.referencePrice = 0.066667 = tokenToShareRatio; list.referencePrice equals price.tokenPrice exactly; bps(price.referencePrice vs price.tokenPrice) = +139999.25.
HTTP/provider code: 200 / "0"
Latency: -
Workaround: -
Was docs behavior accurate?: Unclear - see the KLAC entry above; same unit question.
Suggested fix: -
Evidence ref: evidence.provider_call.id = 9709995e-febc-46d2-b7ae-6b0274ea5c56 (tokens list), d45f19b5-2f8f-41dc-826b-424bc6b2143b (price), probe_run_id = 634f558e-d77d-42eb-aed3-b5e33ca84f1b
```

```text
Timestamp: 2026-09-28T22:58:21.231Z to 22:58:21.830Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Underlying Profile, tokenToShareRatio)
Operation: GET /api/v1/dex/market/rwa/underlying-profile?binanceChainId=56&tokenContractAddress=<KLAC, then ENLV> (2 live calls)
Goal: -
Expected: -
Observed: profile tokenToShareRatio = "10.026064925604903975" for KLAC and "0.066667" for ENLV - byte-identical to each token's /rwa/tokens tokenToShareRatio, and equal under decimal comparison. No ratio disagreement between the two endpoints for either token.
HTTP/provider code: 200 / "0" (both)
Latency: 1261ms, 600ms
Workaround: -
Was docs behavior accurate?: Yes - the profile ratio matched the list ratio, as documented.
Evidence ref: evidence.provider_call.id = e708c370-65cf-4d28-8505-13f27457e252 (KLAC), 5760e0f5-72bc-4138-8412-dd08e7a478a5 (ENLV), probe_run_id = 5f48bfac-3139-48ae-8dd6-cef943648441
```

```text
Timestamp: 2026-09-28T22:51:09.210Z to 22:51:53Z (all stored tokens/price responses in the run)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List; Get RWA Token Price)
Operation: read-only sweep over evidence.provider_call for probe_run_id 634f558e, 485 tokens holding both a /rwa/tokens entry and a /rwa/price entry (229 with tokenToShareRatio = 1, 256 with ratio != 1)
Goal: -
Expected: -
Observed: three relations tested to 9 significant digits. (A) price.tokenPrice / price.referencePrice == tokenToShareRatio: holds for 479 of 485; the 6 exceptions (NVDA 0x02fca66c, GOOGL 0x3f53de71, TQQQ 0x462b5f13, NOK 0x7c4d7a18, MUU 0x0bb3fa77, QCOM 0x5f7a56e8) agree to 9 significant digits and diverge only at the 10th, all with a price.referencePrice rounded to 6 decimals. (B) list.tokenPrice / list.referencePrice == tokenToShareRatio: holds for all 485, no exceptions. (C) list.referencePrice vs price.tokenPrice: median absolute difference 1.7e-13 bps, p90 1.21 bps, p99 20.0 bps, max 73.3 bps, none above 100 bps, across a 41-second gap between the two calls.
HTTP/provider code: 200 / "0" (all source calls)
Latency: -
Workaround: -
Was docs behavior accurate?: Unclear - the relations hold empirically; no doc page states them.
Suggested fix: -
Evidence ref: probe_run_id = 634f558e-d77d-42eb-aed3-b5e33ca84f1b (all /rwa/tokens and /rwa/price rows)
```

```text
Timestamp: 2026-09-28T22:51:09.210Z to 22:51:48Z (profile-call phase of the run)
Author: Claude (agent)
Developer: -
Docs URL/page: - (observation about this repository's probe, not the provider)
Operation: counted /rwa/underlying-profile calls in probe_run_id 634f558e against the representation count per underlyingTicker in the same run
Goal: -
Expected: -
Observed: the run made 80 /rwa/underlying-profile calls and 0 of them were for KLAC 0xfc263946 or ENLV 0x5a9d924f. Of 448 distinct underlyingTicker values in the run, 40 have more than one representation; KLAC and ENLV have exactly one each (both ondo-only). tools/probe/src/pipeline.ts iterates the profile/ratio cross-check over multiRepTickers only, so 408 of 448 tickers received no profile call and no list-vs-profile ratio comparison in this run.
HTTP/provider code: - (counts over stored rows)
Latency: -
Workaround: -
Was docs behavior accurate?: - (not a provider-docs observation)
Suggested fix: -
Evidence ref: probe_run_id = 634f558e-d77d-42eb-aed3-b5e33ca84f1b (80 rows with endpoint LIKE '%/rwa/underlying-profile%')
```
