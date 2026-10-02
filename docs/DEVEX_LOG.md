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

### 2026-09-29 (DEC-026 - referencePrice means different things on /rwa/tokens and /rwa/price)

> **CORRECTED 2026-10-02 (F002 Amendment A1).** The measurements below are correct; one
> label was not. `P` is the **per-TOKEN** price, not the per-underlying-share price.
> `/rwa/price` `referencePrice` (`P / R`) is the **per-share** price. The original wording
> called `P` per-share, which inverted the two. Nothing in the numbers changes.

```text
Timestamp: 2026-09-28T22:51:09.210Z (tokens list) / 2026-09-28T22:51:50.340Z and 22:51:52.734Z (price)
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List; Get RWA Token Price)
Operation: comparison of the stored tokenPrice/referencePrice pair on /rwa/tokens against the pair on /rwa/price, for ondo 0xfc263946439b0d802bf4c5a6fcd34e2885259f91 (KLAC) and ondo 0x5a9d924fc336a5ec8cf3b1909aa660533b50b015 (ENLV)
Goal: -
Expected: a field named referencePrice to carry the same quantity on both endpoints
Observed: it does not. Writing P for the per-TOKEN price and R for tokenToShareRatio (CORRECTED 2026-10-02: P was originally mislabelled as the per-underlying-share price; the per-share price is P / R, i.e. /rwa/price referencePrice), both endpoints satisfy tokenPrice / referencePrice == R internally, but the /rwa/price pair sits one division by R below the /rwa/tokens pair.

  KLAC, R = 10.026064925604903975
    /rwa/tokens  tokenPrice     = 19031.667350173495423663139671929525   (= R x 1898.219041208259)
    /rwa/tokens  referencePrice = 1898.219041208259                      (= P, per TOKEN)
    /rwa/price   tokenPrice     = 1898.219041208258939443                (= P, re-read 41s later)
    /rwa/price   referencePrice = 189.328421                             (= P / R, per SHARE)
    1898.219041208258939443 / 189.328421 = 10.0260649256 = R

  ENLV, R = 0.066667
    /rwa/tokens  tokenPrice     = 0.002318440962013516                   (= R x 0.034776440548)
    /rwa/tokens  referencePrice = 0.034776440548                         (= P, per TOKEN)
    /rwa/price   tokenPrice     = 0.034776440548                         (= P, byte-identical here)
    /rwa/price   referencePrice = 0.521644                               (= P / R, per SHARE)
    0.034776440548 / 0.521644 = 0.066667 = R

So /rwa/tokens referencePrice and /rwa/price tokenPrice are the same quantity P, while /rwa/price referencePrice is P / R. RESOLVED 2026-10-02 (F002 Amendment A1): P is the per-token price and P / R is the per-underlying-share price, consistent with the Binance tokenized-securities rule that one token represents tokenToShareRatio shares and referencePrice = tokenInfo.price / sharesMultiplier. Confirmed live against quotes: see the F002 normalization re-check entry below. The doc pages still do not state the unit of any of these fields.
HTTP/provider code: 200 / "0" (all source calls)
Latency: -
Workaround: DEC-026 leaves /rwa/price referencePrice unused. tools/probe/src/pipeline.ts compares /rwa/tokens referencePrice (T1) against /rwa/price tokenPrice (T2) instead, which is a same-unit comparison.
Was docs behavior accurate?: No - the same field name carries two different scalings across the two endpoints, and neither page documents the unit.
Suggested fix: Document the unit of tokenPrice and referencePrice on both endpoints. (The semantics are resolved as of 2026-10-02; the documentation gap is not.)
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

### 2026-09-30 (F002 normalization check, spec section 2) - SUPERSEDED, see the 2026-10-02 re-check

```text
Timestamp: 2026-09-30T00:00:00.000Z
Author: Claude (agent)
Developer: -
Docs URL/page: docs/specs/F002-spec.md section 2 (verified facts) and https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data (Get RWA Token List: tokenPrice, referencePrice, tokenToShareRatio)
Operation: GET /api/v1/dex/market/rwa/tokens (both platforms) then GET /api/v1/dex/aggregator/quote (binanceChainId=56, fromTokenAddress=USDT, amount=100 USDT, userWalletAddress=<burn>) for tokens chosen by tokenToShareRatio. Read-only, nothing signed.
Goal: F002 spec section 2 requires confirming normalizedShares = toTokenAmount * tokenToShareRatio against a live quote for one 1:1 token and one non-1:1 token BEFORE the engine relies on it.
Expected: For a correct normalization, the effective price per underlying share derived from a live quote should land on /rwa/tokens referencePrice, which F001-A treats as the per-underlying-share price.
Observed: The formula is refuted by live quotes, by exactly the ratio factor. Two hypotheses were compared against referencePrice for the same quote:
  H1 (spec): shares = (toTokenAmount / 10^decimals) * tokenToShareRatio
  H2:        tokens = (toTokenAmount / 10^decimals), no ratio multiplication
  ratio far from 1 (decisive, probe_run bfb33c67-4ce8-491d-8006-780f2ccc0d05):
    ondo KLACon, ratio 10.026064925604903975: H1 -8996.9 bps vs referencePrice, H2 +56.9 bps
    ondo PPLTon, ratio 10:                    H1 -9000.2 bps,                   H2 -2.0 bps
    ondo NFLXon, ratio 10:                    H1 -8999.5 bps,                   H2 +4.6 bps
  ratio at or near 1 (non-discriminating, probe_run 09a1ecf8-c7de-44a9-ba5c-d93e3f4b1600):
    ondo AALon, ratio exactly 1:              H1 = H2 = -0.51 bps
    ondo EEMon, ratio 1.013664147460543285:   H1 -125.5 bps,                    H2 +9.5 bps
  H2 is consistent with all 5 observations; H1 is consistent only with the two whose ratio is within 1.4% of 1, where the two hypotheses are indistinguishable from ordinary spread.
  tokenPrice / referencePrice equalled tokenToShareRatio exactly on all three far-from-1 tokens (10.026064925604903975, 10, 10), so the arithmetic half of the spec statement holds. What does not hold is the inference drawn from it. The live market price per token tracks referencePrice, not tokenPrice.
  Independent economic cross-check, no API needed: PPLT is a platinum ETF trading near USD 155. referencePrice is 155.08416 and tokenPrice is 1550.8416. Under the spec reading, USD 100 would buy 6.449 shares of a USD 155 asset, i.e. about USD 1000 of exposure for USD 100. That is impossible, so one PPLTon cannot represent 10 PPLT shares.
  Conclusion: on /rwa/tokens, referencePrice behaves as the market price of ONE TOKEN and tokenPrice is that value scaled up by tokenToShareRatio. tokenToShareRatio therefore does not mean "shares represented by one token" in the direction F002 section 2 assumes. The correct per-share unit and the true meaning of tokenToShareRatio are NOT determined by this check; only the spec formula is refuted.
  This lands on an already-recorded open risk: DEC-026 logged that the unit of referencePrice is inconsistent between /rwa/tokens and /rwa/price and that neither doc page states the unit of either field.
  *** SUPERSEDED 2026-10-02 - THIS ENTRY CONCLUDED WRONGLY. *** The formula is CORRECT. The error was the benchmark, not the formula: /rwa/tokens referencePrice is a per-TOKEN price, so comparing a per-share figure against it is wrong by exactly tokenToShareRatio - which is precisely the ~9000 bps (10x) seen below. The per-share benchmark is /rwa/price referencePrice. Re-checked against it, the formula passes: see the next entry. Kept rather than deleted because the log is append-only and the mistake is the point.
HTTP/provider code: 200 / 0 for every successful quote; 200 / 40367 for ondo ENLVon (non-trading session, skipped as a normal outcome)
Latency: -
Workaround: None applied. F002 spec section 7 requires stopping rather than adjusting the formula, so implementation of T1-T5 stopped at this gate and no normalization code was written.
Was docs behavior accurate?: The RWA data doc page does not state the unit of tokenPrice, referencePrice or tokenToShareRatio, which is what allowed two contradictory readings to look equally defensible. The provider fields are self-consistent; the documentation is silent on their units.
Suggested fix: Document the unit of tokenPrice, referencePrice and tokenToShareRatio explicitly, and state which one is the executable market price per token.
Evidence ref: evidence.provider_call.id = 56c5e944-e892-4e3c-b4c3-d6a92d0d6462 (first far-from-1 quote), 85c0c6bd-ae4f-4866-bf04-98924680dcb3 (first 1:1 quote); probe_run_id = bfb33c67-4ce8-491d-8006-780f2ccc0d05 (discriminator) and 09a1ecf8-c7de-44a9-ba5c-d93e3f4b1600 (initial check). Computed rows in reports/f002-normalization-{confirmation,discriminator}.json (git-ignored).
```

### 2026-10-02 (F002 normalization re-check against the correct per-share benchmark - PASS)

```text
Timestamp: 2026-10-02T12:57:34.859Z to 2026-10-02T12:57:58.501Z (one 23.6s window)
Author: Claude (agent)
Developer: -
Docs URL/page: docs/specs/F002-spec.md section 2 and Amendment A1; Binance tokenized-securities concept "Token != Share" (one token = sharesMultiplier shares; referencePrice = tokenInfo.price / sharesMultiplier); https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data
Operation: GET /api/v1/dex/market/rwa/tokens (both platforms), then ONE batched GET /api/v1/dex/market/rwa/price for all 21 selected addresses, then GET /api/v1/dex/aggregator/quote (chain 56, fromTokenAddress USDT, amount 100 USDT, userWalletAddress burn) per selected token. Read-only; nothing signed, no /swap, no wallet.
Goal: Re-run the F002 section 2 confirmation using /rwa/price referencePrice as the per-share benchmark, after the 2026-09-30 attempt used /rwa/tokens referencePrice and wrongly concluded the formula was refuted.
Expected: impliedPricePerShare = 100 / ((toTokenAmount / 10^decimals) * tokenToShareRatio) should land on /rwa/price referencePrice. Owner criterion: the ratio >= 2 group within +/-300 bps.
Observed: PASS. Population at the time of the window: 488 returned, 485 usable, of which 9 with tokenToShareRatio >= 2 and 2 with ratio <= 0.5 (11 far from 1), 228 at ratio exactly 1, and 122 in [1.005, 1.03]. Selected all 11 far-from-1 tokens plus 5 at ratio 1 and 5 near 1 (21 total); /rwa/price returned all 21; 19 produced a quote.
  ratio >= 2 group, deviation of impliedPricePerShare from /rwa/price referencePrice:
    ondo NFLXon  ratio 10                       implied 68.1199666212   bench 68.081481    +5.7 bps
    ondo PPLTon  ratio 10                       implied 15.7309885944   bench 15.709643   +13.6 bps
    ondo NOWon   ratio 5                        implied 139.2716715390  bench 139         +19.5 bps
    ondo APHon   ratio 2.004270673342698199     implied 87.5274468687   bench 87.34       +21.5 bps
    ondo PALLon  ratio 5                        implied 21.6315842841   bench 21.578929   +24.4 bps
    ondo KLACon  ratio 10.026064925604903975    implied 207.0826406100  bench 206.520833  +27.2 bps
    ondo CVNAon  ratio 5                        implied 64.9994485140   bench 64.74       +40.1 bps
    ondo CRWDon  ratio 4                        implied 269.0267493600  bench 267.9325    +40.8 bps
    ondo IWFon   ratio 4.012874287579009489     implied 127.5126786000  bench 126.860167  +51.4 bps
    => 9 of 9 evaluated, worst absolute deviation 51.4 bps, ZERO outside +/-300 bps.
  other groups, for contrast:
    ratio <= 0.5:        ondo SOXSon ratio 0.101695663086635307, +7.7 bps (1 evaluated)
    ratio == 1:          5 evaluated, worst +32.5 bps (bstock INTWB)
    ratio 1.005-1.03:    4 evaluated, worst +22.3 bps (ondo OXYon); ondo BILon was -1.5 bps
    Worst across all 19 evaluated tokens: 51.4 bps.
  Every deviation is positive except BILon, which is consistent with paying spread plus fees above the reference.
  Exceptions, listed not hidden - both documented normal outcomes, neither a formula failure:
    ondo ENLVon  ratio 0.066667                 no quote, provider code 40367 (non-trading session)
    ondo ORCLon  ratio 1.0079328914586566       no quote, provider code 40374 (insufficient liquidity)
  Why the 2026-09-30 attempt failed: it benchmarked against /rwa/tokens referencePrice, which is per-TOKEN. A per-share figure compared to a per-token benchmark is wrong by exactly tokenToShareRatio, which is why the three ratio-10 tokens showed about -9000 bps, i.e. a clean factor of 10, rather than noise. The "H2" column in that entry (deviation of price-per-token from the per-token field) is algebraically identical to this entry's deviation of price-per-share from the per-share field, and it already read +56.9, -2.0 and +4.6 bps.
  Not established by this check: that one provider share equals one exchange-listed share. For PPLTon the per-share benchmark is 15.709643 while the real-world PPLT ETF trades near 155, a factor of about 10. F002 compares representations of the same underlying, so this does not affect it, but it does mean cross-platform comparability needs its own evidence - T5 reports the bStock-vs-Ondo per-share benchmark agreement in bps instead of assuming it.
HTTP/provider code: 200 / 0 for the tokens pass, the price batch and all 19 successful quotes; 200 / 40367 and 200 / 40374 for the two skips
Latency: whole window 23.6s for 2 tokens calls + 1 price batch + 21 quote attempts
Workaround: -
Was docs behavior accurate?: The provider fields are self-consistent and the tokenized-securities concept documents the relationship. The REST doc pages still do not state the unit of tokenPrice or referencePrice on either endpoint, which is what allowed the wrong benchmark to look defensible.
Suggested fix: State the unit of tokenPrice and referencePrice on both /rwa/tokens and /rwa/price, and say explicitly which field is per share.
Evidence ref: probe_run_id = b44704bc-7870-474b-9c66-4688b6cbb9c1 (terminal event COMPLETE); computed rows in reports/f002-normalization-recheck.json (git-ignored). Superseded attempt: probe_run_id = bfb33c67-4ce8-491d-8006-780f2ccc0d05 and 09a1ecf8-c7de-44a9-ba5c-d93e3f4b1600.
```

### 2026-10-02 (F002 T5 - priceImpactPercent is a fraction, not a percentage)

```text
Timestamp: 2026-10-02T13:50:00.000Z
Author: Claude (agent)
Developer: -
Docs URL/page: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api (Get Aggregated Quote, priceImpactPercent)
Operation: GET /api/v1/dex/aggregator/quote (chain 56, fromTokenAddress USDT, amount 100 USDT, userWalletAddress burn) for both representations of each of the 40 multi-representation tickers. Read-only, nothing signed.
Goal: Rank the two representations of each ticker by normalized shares and reject anything outside the eligibility policy.
Expected: priceImpactPercent to be a percentage, as the field name says, so a 300 bps ceiling would be compared against value x 100.
Observed: The field is a FRACTION in [0,1]. Four live routes returned catastrophically less than their sibling for the same 100 USDT, and the provider value tracked the true loss fraction, not a percentage:
    ondo AVGOon    provider 0.9990013351   true loss fraction 0.999997   (824330485648 vs bstock 285226508371740516, both 18 decimals)
    ondo MSFTon    provider 0.9996010028   true loss fraction 1.000000   (63212547187 vs bstock 192563437766822581)
    bstock NBISB   provider 0.9609756649   true loss fraction 0.811442   (paid 1281.36/share against a 241.61 benchmark)
    ondo SNDKon    provider 0.9319177781   true loss fraction 0.890726   (paid 16005.95/share against a 1749.04 benchmark)
  The true loss fraction is computed independently as 1 - (per-share benchmark / effective price per share), where the benchmark is /rwa/price referencePrice. Read as a percentage, 0.999 would describe a 0.999% impact on a route that returned 0.0000008 shares instead of 0.286 - a 99.9997% loss, understating it by about 100,000x. Read as a fraction it is accurate to three decimal places on the two extreme cases.
  The healthy routes in the same run reported 0, -0.0000000000 or 0.01069987, which is consistent with either reading, so only the extreme cases settle the scale. They settle it unambiguously. The sibling field taxRate is documented by the provider as "0-1", which is the same convention.
  Effect of getting it wrong, measured: with x 100 (the percent reading) all four mispriced routes passed a 300 bps ceiling and were ranked as ELIGIBLE. The normalized-shares spread between platforms then ran to 30329056123.9 bps and the four routes sat up to 30344498099 bps away from their own per-share benchmark. With x 10000 they convert to 9990, 9996, 9610 and 9319 bps and are rejected as PRICE_IMPACT_EXCEEDS_MAX.
  After the correction, over the same 40 tickers: 5 PRICE_IMPACT_EXCEEDS_MAX rejections, worst remaining platform spread 88 bps (median 5.4), and every ELIGIBLE candidate within 91.3 bps of its per-share benchmark (median 18.1). Winners were unchanged at bstock 27 and ondo 13, because the ranking already preferred the sane side on shares; the correction removed the bad candidates from consideration rather than changing any outcome. Tickers with fewer than 2 eligible candidates rose from 12 to 17, which is the honest consequence.
  Residual risk, NOT fixed and worth an owner decision: the policy has no ceiling on referenceDeviationBps. A route that is wildly mispriced but reports a small or zero priceImpactPercent would still be ELIGIBLE, and for a ticker where it is the only eligible candidate it would be selected. The blueprint (Stage B step 7) treats reference deviation as transparency rather than an execution gate, and F002 T2 does not list a reason code for it, so none was added.
HTTP/provider code: 200 / 0 for all 68 successful quotes; 12 quote attempts returned no route
Latency: -
Workaround: priceImpactPercentToBps multiplies by 10000, with the evidence recorded in the function comment so the scale cannot be silently reverted.
Was docs behavior accurate?: No. The field is named priceImpactPercent and the page calls it a "price impact percentage", but the value behaves as a fraction. The doc page does not state the scale, and for ordinary small values the two readings are indistinguishable, which is how a 100x error can survive unnoticed.
Suggested fix: State the scale of priceImpactPercent explicitly, or rename it. A caller enforcing a slippage or impact ceiling on the documented reading is out by 100x in the permissive direction, which is the dangerous direction.
Evidence ref: probe_run_id = 18ba4538-7c58-4940-8e45-1eae44a7646b (the run that exposed it, pre-fix) and eace2297-c3a1-44d7-bf60-14a279f3ebef (post-fix, same 40 tickers). Per-candidate provider_call ids: evidence.provider_call.id = c6ace4fa-17ec-43fe-baf4-17117145f9e0 (AVGOon), 7eac6a64-e9c0-4c7a-8288-785842035a77 (MSFTon), 62b258fc-a438-4e83-a50c-facb342e8061 (AVGOB, the healthy sibling), 900f3a4b-3e79-4061-bbf4-9d7707487969 (MSFTB).
```
