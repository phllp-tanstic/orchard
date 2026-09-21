# DevEx Candidates

Raw doc ambiguities agents hit while implementing against the Binance Web3 API docs or other
official docs. For the owner to reproduce or discard — not a substitute for `docs/DEVEX_LOG.md`,
which records observations against the real provider.

Each entry: doc page, section, observation.

## Candidates

| Doc page | Section | Observation |
| --- | --- | --- |
| https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data | Get RWA Token List — `decimals` field | Parameter table documents `decimals` as type STRING. The example JSON response for the same endpoint shows `"decimals": 18` as a bare (unquoted) number, not a string. No live provider call has been made yet to observe which shape the API actually returns; this is a doc-internal inconsistency only. |
