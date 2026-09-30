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

### 2026-09-29 (DEC-026 - unresolved: referencePrice means different things on /rwa/tokens and /rwa/price)

```text
Timestamp: 2026-09-28T22:51:09.210Z (tokens list) / 2026-09-28T22:51:50.340Z and 22:51:52.734Z (price)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List; Get RWA Token Price)
Operation: comparison of the stored tokenPrice/referencePrice pair on /rwa/tokens against the pair on /rwa/price, for ondo 0xfc263946439b0d802bf4c5a6fcd34e2885259f91 (KLAC) and ondo 0x5a9d924fc336a5ec8cf3b1909aa660533b50b015 (ENLV)
Goal: -
Expected: a field named referencePrice to carry the same quantity on both endpoints
Observed: it does not. Writing P for the per-underlying-share price and R for tokenToShareRatio, both endpoints satisfy tokenPrice / referencePrice == R internally, but the /rwa/price pair sits one division by R below the /rwa/tokens pair.

  KLAC, R = 10.026064925604903975
    /rwa/tokens  tokenPrice     = 19031.667350173495423663139671929525   (= R x 1898.219041208259)
    /rwa/tokens  referencePrice = 1898.219041208259                      (= P)
    /rwa/price   tokenPrice     = 1898.219041208258939443                (= P, re-read 41s later)
    /rwa/price   referencePrice = 189.328421                             (= P / R)
    1898.219041208258939443 / 189.328421 = 10.0260649256 = R

  ENLV, R = 0.066667
    /rwa/tokens  tokenPrice     = 0.002318440962013516                   (= R x 0.034776440548)
    /rwa/tokens  referencePrice = 0.034776440548                         (= P)
    /rwa/price   tokenPrice     = 0.034776440548                         (= P, byte-identical here)
    /rwa/price   referencePrice = 0.521644                               (= P / R)
    0.034776440548 / 0.521644 = 0.066667 = R

So /rwa/tokens referencePrice and /rwa/price tokenPrice are the same quantity P, while /rwa/price referencePrice is P / R - a third scaling that no doc page describes. Which of the two endpoints is the intended convention is not determinable from the data; neither doc page states the unit of either field.
HTTP/provider code: 200 / "0" (all source calls)
Latency: -
Workaround: DEC-026 leaves /rwa/price referencePrice unused. tools/probe/src/pipeline.ts compares /rwa/tokens referencePrice (T1) against /rwa/price tokenPrice (T2) instead, which is a same-unit comparison.
Was docs behavior accurate?: No - the same field name carries two different scalings across the two endpoints, and neither page documents the unit.
Suggested fix: - (unresolved; not addressed by DEC-026)
Evidence ref: evidence.provider_call.id = 9709995e-febc-46d2-b7ae-6b0274ea5c56 (tokens list), 2ea05d39-e84c-45a5-9248-6ed032400459 (KLAC price), d45f19b5-2f8f-41dc-826b-424bc6b2143b (ENLV price), probe_run_id = 634f558e-d77d-42eb-aed3-b5e33ca84f1b
```

### 2026-09-30 (DEC-031)

```text
Timestamp: 2026-09-30T00:41:50.000Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api (Build Swap Transaction, query parameters)
Operation: GET /api/v1/dex/aggregator/swap (binanceChainId=56, fromTokenAddress=USDT, toTokenAddress=<tokenized stock>, userWalletAddress=<burn>, quoteId=<fresh>)
Goal: Build a swap transaction from a quoted route using only the parameters the doc page marks required.
Expected: The request to succeed. The doc page lists slippagePercent and autoSlippage BOTH as optional, and neither appears in its required set.
Observed: Every such request is rejected: code 40001, msg "either slippagePercent or autoSlippage is required". 42 consecutive rejections across 14 quoted routes in one run, zero successes. Supplying slippagePercent=0.5 makes the identical request succeed.
HTTP/provider code: 200 / 40001
Latency: 474ms average across the 40001 responses
Workaround: tools/probe-quote sends slippagePercent on every /swap call (default 0.5, overridable via PROBE_SLIPPAGE_PERCENT) and records the value in the report, since slippage determines the built tx minReceiveAmount.
Was docs behavior accurate?: No - one of two parameters documented as optional is in fact mandatory. The docs do not state that at least one of the pair is required.
Suggested fix: Document slippagePercent/autoSlippage as "exactly one required" rather than both optional.
Evidence ref: evidence.provider_call.id = a1e72cb2-f30b-4a86-855a-4d468afa760a, a254c0de-4d98-4793-a91c-83cd2f49371d, probe_run_id = 322a8594-438c-4486-8a6b-9c726a70502c
```

```text
Timestamp: 2026-09-30T00:02:10.000Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api (Get Aggregated Quote, error codes) and https://web3.binance.com/en/dev-docs/authentication (documented code list)
Operation: GET /api/v1/dex/aggregator/quote (binanceChainId=56, fromTokenAddress=USDT, toTokenAddress=<tokenized stock>, amount=10/100/1000 USDT, userWalletAddress=<burn>)
Goal: Quote a purchase of each sampled tokenized stock at three spend sizes.
Expected: Either a quote, or a failure carrying one of the documented envelope codes (40001, 40101, 40102, 40103, 40104, 42900, 50000, 50001) or a documented Trading API code (40401 QUOTE_EXPIRED, 40462 SWAP_QUOTE_MISMATCH).
Observed: Two codes outside every documented set, together accounting for every quote failure in the run - 107 of 288 attempts.
  40374, msg "Insufficient liquidity for a quote. Please decrease the transaction amount or try again later." (39 responses)
  40367, two distinct message forms (68 responses):
    "Token <symbol> is currently in a non-trading session. Expected to open in 0d 13h 49m."
    "The stock market is shifting its trading phase. Expected to open in 0d 0h 5m."
  The symbol is sometimes absent from the 40367 text, leaving a double space ("Token  is currently...").
  40367 is market-hours dependent: the same seeded sample produced 61 of 96 representations quoting at 00:02, versus 81 of 96 an hour earlier, differing only in how many underlyings were in a trading session.
HTTP/provider code: 200 / 40367 and 200 / 40374
Latency: 463ms average (40367), 688ms average (40374)
Workaround: Both are treated as ordinary per-representation quote failures - recorded in the report and in incompleteReasons, never aborting the run. Neither is in NO_RETRY_CODES, so each is retried maxRetries times before being recorded.
Was docs behavior accurate?: No - neither code appears in the authentication doc list or on the Trading API page. A caller cannot distinguish "no liquidity at this size" from "market closed" using any documented code.
Suggested fix: Document 40367 and 40374, and state whether either is retryable. Both are permanent for the request as sent, so retrying wastes quota.
Evidence ref: evidence.provider_call.id = 28a38b12-0e89-492e-a722-ed6911ba3a70 (40374), 27b83efb-69a5-4453-8143-4a2139592f32 (40367), probe_run_id = 1f42f52f-a9c8-463d-8bf9-a344758f3b6c
```

```text
Timestamp: 2026-09-30T00:44:01.000Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api (Simulate Transactions)
Operation: POST /api/v1/dex/pre-transaction/simulate (binanceChainId=56, evmTx={from:<burn>, to:USDT, value:"0", data:<approve calldata from GET /api/v1/dex/aggregator/approve-transaction>})
Goal: DEC-031 item 1 - determine whether the ERC-20 approve leg alone simulates from a zero-balance address, given that the swap-tx leg does not.
Expected: Unknown. The doc page does not state whether a simulation requires the sender to hold balance or to have granted an allowance.
Observed: The approve leg simulates successfully from a zero-balance address. 12 of 12 sampled calls returned data.status "SUCCESS", data.failReason null, and exactly one allowanceChanges entry showing preAmount "0" -> postAmount equal to the approved amount, for owner 0x...dEaD and spender 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5. The same address swap-tx simulation returns status "FAILED", failReason "execution reverted: BEP20: transfer amount exceeds allowance", on 181 of 181 attempts. So the endpoint executes against real chain state, and the two legs differ because an approve requires no balance while a transferFrom does.
  Sample caveat: the approve is on the SPEND token, so its calldata depends only on (spend token, spender, amount) and not on which tokenized stock is being bought. All 181 successful quotes in the source run named a single approveTarget (0xB44446b0...FdDA5). The 12 sampled calls therefore covered only 3 genuinely distinct transactions, one per spend size.
HTTP/provider code: 200 / 0 (all 24 calls: 12 approve-transaction, 12 simulate)
Latency: -
Workaround: -
Was docs behavior accurate?: Partly - the documented request and response shapes matched exactly. The page is silent on the balance/allowance precondition, which is the fact that determines whether a simulation is meaningful.
Suggested fix: State explicitly that simulation executes against current chain state, and that a transfer-bearing transaction from an address without balance or allowance will report FAILED.
Evidence ref: evidence.provider_call.id = 93d5aa4a-a299-4636-877a-dc006fcb6d79 (approve-transaction), 69ba1d70-07d6-47dd-86b7-c44cb0d51108 (simulate, SUCCESS), probe_run_id = ef176412-9d7e-45a0-90f7-745518c7ef7f (assessment), source probe_run_id = 1f42f52f-a9c8-463d-8bf9-a344758f3b6c
```

```text
Timestamp: 2026-09-30T00:38:00.000Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api (Simulate Transactions, request schema)
Operation: Documentation re-read (DEC-031 item 2), no API call.
Goal: Determine whether Simulate Transactions documents any state-override, balance-override, allowance-override, account-override, or fork-at-block capability that would let a zero-balance address simulate a transfer-bearing transaction.
Expected: -
Observed: No override capability of any kind is documented. The request schema is binanceChainId plus exactly one of evmTx {from, to, value, data}, solTx {base64Tx, address}, or tronTx {from, txType, triggerSmartContractParams | transferContractParams}. There is no state, balance, allowance or account override field, no block-number or fork-at-block pinning, and no simulation-options object. The page is also silent on whether the sender must hold balance or have granted allowance.
HTTP/provider code: -
Latency: -
Workaround: None available through this endpoint. Simulating a transfer-bearing transaction to a non-FAILED status requires an address that actually holds the spend token and has approved the spender - a funded address, which is a DEC-028 decision rather than a code change.
Was docs behavior accurate?: Yes for what it describes - the four evmTx fields are exactly what the endpoint accepts. The absence of overrides is a capability gap, not a documentation error.
Suggested fix: -
Evidence ref: - (documentation observation, re-fetched 2026-09-30. Related live evidence: probe_run_id = ef176412-9d7e-45a0-90f7-745518c7ef7f)
```

### 2026-09-30 (pre-DEC-035 spender provenance check)

```text
Timestamp: 2026-09-30T00:00:00.000Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api (Get Aggregated Quote approveTarget; Get ERC-20 Approve Transaction dexContractAddress)
Operation: Read-only provenance check on the approveTarget/dexContractAddress the live Trading API returns. No signing, no broadcast, no wallet interaction. eth_getCode + eth_call against public BSC RPC (bsc-dataseed.bnbchain.org); Sourcify v2; BscScan/Etherscan APIs.
Goal: Establish what 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5 actually is before any real-money approve is ever signed against it.
Expected: A documented, verifiable spender. The API instructs callers to approve this address, so a caller should be able to confirm out-of-band what it is and what it can do with approved funds.
Observed:
  The Trading API returns this address as approveTarget on all 181 successful quotes and as data[].dexContractAddress on all 12 approve-transaction calls (probe_run ef176412-9d7e-45a0-90f7-745518c7ef7f), but NO Binance doc page publishes any spender/router address list, so there is nothing to check the value against. Its only occurrences in this repo are artifacts this project itself produced.
  On-chain, read-only:
    - 180-byte EIP-2535 diamond proxy stub, Solidity 0.8.23, diamond storage slot 0x5e12654f390e4153c4f63b3dfcc122cf7876a5cdfb496dccf7284c10517a35c5.
    - facetAddresses() returns 6 facets; facets() exposes 20 selectors total.
    - Resolved selectors include diamondCut((address,uint8,bytes4[])[],address,bytes) (0x1f931c1c), transferOwnership/confirmOwnershipTransfer/cancelOwnershipTransfer/owner, the diamond loupe, addRouters(address[]) / removeRouters(address[]) / getRouterList(), and get/setFeeRecipient(address).
    - owner() = 0x1c6f8a6d1011ca0334f6f8f5e2f9222ef1b68fa9, which has NO code: an EOA. A single private key can therefore diamondCut (replace any logic), addRouters (whitelist arbitrary call targets) and setFeeRecipient.
    - getRouterList() returns 15 whitelisted routers. Three identified independently: 0x111111125421ca6dc452d289314280a0f8842a65 = 1inch Aggregation Router V6, 0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae = LI.FI Diamond, 0x0f9f2366c6157f2acd3c2bfa45cd9031c152d2cf = Native Relay RFQ. getFeeRecipient() = 0xd2a27f8fdbaaec431d59046a8bce4e5db665a271.
    - Business facet 0xa9fa1b56f4d7bd25375c2d40b4c8e36a9509e603 (8622 bytes) contains the transferFrom(address,address,uint256) selector (so it can pull approved funds), approve and transfer selectors, and 9 CALL plus 3 STATICCALL opcodes. No DELEGATECALL, SELFDESTRUCT, CREATE or CREATE2 in that facet.
    - 5 of that facet's 7 selectors (0x52d99600, 0xad43f73d, 0x2b3ed68d, 0xcbacb34e, 0x98da6067) resolve to nothing in public signature databases, so the swap entry points' semantics are undetermined.
  Verification status: unverified. Sourcify v2 returns match=null, creationMatch=null, runtimeMatch=null for the diamond AND for all 6 facets on chain 56. BscScan shows no source and no name tag (owner-observed).
  Relationship to the one publicly named Binance router: 0xb300000b72deaeb607a12d5f54773d1c19c7028d is name-tagged "Binance: DEX Router" on Etherscan, BscScan, Polygonscan, Basescan and Optimistic Etherscan, and is verified. Its proxy runtime bytecode is byte-IDENTICAL to this spender's except for exactly 32 bytes, which are the Solidity metadata IPFS hash (ours 64cea10a..., theirs 930a620c...). Same diamond template, same compiler, same storage slot. HOWEVER none of this spender's 6 facets shares bytecode with any of that contract's 8 facets, and no facet address is reused - so the verified sibling's source says nothing about what this spender's logic actually does.
  Approval sizing (mitigating): the approve calldata Binance returns is always exact-amount, never unlimited - 0x095ea7b3 with 10/100/1000 * 10^18 matching each spend size, spender 0xb44446b0...fdda5. No MaxUint256 approval was ever requested across the 12 stored calls.
HTTP/provider code: 200 / 0 for every Binance call. api.bscscan.com/api v1 now answers HTTP 301 to a docs page; api.etherscan.io/v2 answers {"status":"0","message":"NOTOK","result":"Missing/Invalid API Key"}; bscscan.com and blockscan.com UI answer HTTP 403 to non-browser clients.
Latency: -
Workaround: None needed for F001-B, which signs nothing. For any future real-money approve this is a gate, not a detail.
Was docs behavior accurate?: Incomplete rather than wrong. The API returns a spender address that the documentation never publishes, so a caller cannot verify out-of-band that the approveTarget is the intended contract. A substituted or wrong approveTarget would be indistinguishable from a correct one.
Suggested fix: Publish the official spender/router addresses per chain in the Trading API docs, and verify the contract source on BscScan, so callers can confirm the approveTarget before approving funds to it.
Evidence ref: evidence.provider_call.id = 93d5aa4a-a299-4636-877a-dc006fcb6d79 (approve-transaction, data[].dexContractAddress), probe_run_id = ef176412-9d7e-45a0-90f7-745518c7ef7f; approveTarget across probe_run_id = 1f42f52f-a9c8-463d-8bf9-a344758f3b6c. On-chain reads are reproducible against any BSC RPC and are not stored as evidence rows (not Binance API calls).
```

```text
Timestamp: 2026-09-30T00:00:00.000Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://docs.etherscan.io (BscScan API v1 -> Etherscan V2 multichain migration)
Operation: GET https://api.bscscan.com/api?module=contract&action=getsourcecode|getabi and GET https://api.etherscan.io/v2/api?chainid=56&...
Goal: Retrieve verification status and ABI for a BSC contract as part of the spender provenance check.
Expected: Keyless access to getsourcecode/getabi, as BscScan v1 historically allowed at a low rate limit.
Observed: api.bscscan.com/api returns HTTP 301 to a Mintlify documentation page for every module=contract request; no JSON is served. The replacement api.etherscan.io/v2/api?chainid=56 returns {"status":"0","message":"NOTOK","result":"Missing/Invalid API Key"} without a key. The bscscan.com and blockscan.com web UIs return HTTP 403 to non-browser user agents, so UI-only facts (contract creator, "contracts with exact matching bytecode") are unreachable programmatically. Sourcify v2 (https://sourcify.dev/server/v2/contract/56/<address>) is keyless and worked as a substitute for verification status only.
HTTP/provider code: 301 (bscscan v1), 200 with status 0 / "Missing/Invalid API Key" (etherscan v2), 403 (bscscan.com and blockscan.com UI)
Latency: -
Workaround: Public BSC JSON-RPC (eth_getCode, eth_call) for on-chain facts, Sourcify v2 for verification status, openchain.xyz signature database for selector resolution. Any contract-verification, creator-history or bytecode-twin lookup needs an Etherscan V2 API key, which this project does not have.
Was docs behavior accurate?: n/a - third-party explorer, not a sponsor API.
Suggested fix: Add an ETHERSCAN_API_KEY (V2 multichain, free tier covers BSC) to .env.example if contract provenance checks are to be repeatable.
Evidence ref: - (third-party explorer observation, 2026-09-30)
```
