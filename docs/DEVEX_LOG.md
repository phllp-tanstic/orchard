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
