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
