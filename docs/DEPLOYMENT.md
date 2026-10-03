# Deployment

How to take Orchard from this repository to a running public preview, click by click.

**Nothing in this document has been executed.** It describes the procedure the artifacts in
this repository (`Dockerfile`, `Dockerfile.jobs`, `render.yaml`) were built for. The image
has been built and run locally against local Postgres; no Supabase project and no Render
service exist yet. Status of this document: `NOT IMPLEMENTED`, in the sense of AGENTS.md.

Decisions this follows: **DEC-041** (Render, Frankfurt, starter plan, exactly one instance)
and **DEC-042** (production database is Supabase, reached through the **session** pooler on
port 5432). Both are recorded in `docs/DECISIONS.md`.

---

## 0. Before you start

**What is deployed.** A read-only web app. It searches a stored universe snapshot, asks the
provider for quotes, and ranks eligible routes. It does not sign, submit or broadcast
anything, and it holds no wallet.

**Three roles, and they are not interchangeable.**

| Role                                | Variable                   | Can it do DDL?                                | Where does it live?                              |
| ----------------------------------- | -------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Supabase project owner (`postgres`) | `DATABASE_URL`             | yes - creates schemas, roles, owns everything | **your machine only, for one command at a time** |
| `orchard_app`                       | `ORCHARD_APP_DATABASE_URL` | no - `SELECT` and `INSERT` only               | Render's secret store                            |
| `orchard_migrator`                  | -                          | owns the schemas; `NOLOGIN`                   | nowhere; it cannot log in                        |

The running app gets the **least-privileged** role and only that one. `DATABASE_URL` never
goes into Render, never into an image, never into `.env` on a server. If you ever find
yourself pasting it into a dashboard, stop.

**The region is not a preference.** The provider blocks a documented list of regions and
checks both the client IP and the server location
(`web3.binance.com/en/dev-docs/web3-api-prohibited-regions`). Of Render's five regions only
Frankfurt and Singapore sit outside that list, and of Supabase's, Frankfurt is the match.
Put **both** the database and the app in Frankfurt.

**UNVERIFIED, and this is the thing the first deploy actually tests:** whether the provider
accepts authenticated calls from Render's Frankfurt egress IP range. Nobody has measured it.
If the provider answers with a region or auth block, **stop and report** - F003 section 7
says no workaround.

**Gates first.** Do not deploy a tree that has not passed:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:web && pnpm web:build
```

---

## 1. Create the Supabase project (Frankfurt)

1. Go to <https://supabase.com/dashboard> and sign in.
2. **New project**.
3. **Name**: `orchard-production`.
4. **Database Password**: click **Generate a password** and let Supabase produce it. Do not
   invent one. Put it straight into your password manager - this is the project owner's
   password and Supabase will not show it to you again.
5. **Region**: **Central EU (Frankfurt)**. Nothing else. If you pick a region on the
   prohibited list you will not find out until the provider refuses a call from it.
6. **Create new project**, then wait for provisioning to finish.

Write down the **project ref** - the random string in the dashboard URL,
`https://supabase.com/dashboard/project/<project-ref>`. Every connection username contains it.

---

## 2. Take the SESSION pooler URI

DEC-042 says the **session** pooler, port **5432** - not the transaction pooler on 6543.
This matters: the app uses a `pg` connection pool with prepared statements and long-lived
connections (`apps/web/src/server/db.ts`), and the transaction pooler does not support that
shape. Migrations need it even more: `node-pg-migrate` runs the whole batch in one
transaction with advisory locks.

1. In the project, click **Connect** (top of the dashboard).
2. Choose the **Session pooler** tab.
3. Copy the URI. It looks like:

   ```
   postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres
   ```

   Check three things before you move on: the username is `postgres.<project-ref>` (the
   project ref is part of the username through the pooler, not only the host), the port is
   **5432**, and the host contains `pooler.supabase.com`. If the port says 6543 you are on
   the transaction pooler tab.

4. Substitute your project password for the `<password>` placeholder, URL-encoding any
   character that is special in a URI (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`).
   A generated Supabase password is usually alphanumeric, but check.

Keep this in your password manager. It is the **migrator** URL. It does not go into `.env`
and it does not go into Render.

---

## 3. Choose the `orchard_app` password

`orchard_app` is created by migration 001 and given its login password by `db/migrate.ts`
reading `ORCHARD_APP_DB_PASSWORD` - deliberately out-of-band, so no password is ever written
into a migration file that gets committed.

Generate a strong one now, before running migrations. 32+ characters, random, from a
generator - not typed:

```bash
# Git Bash / Linux / macOS
openssl rand -base64 36 | tr -d '/+=' | cut -c1-40
```

```powershell
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

Put it in your password manager next to the migrator URL. Avoid `/`, `+`, `=`, `@`, `:` and
`#` so you never have to URL-encode it; the commands above already strip them.

---

## 4. Run the migrations from your machine, for one command only

Run these from the repository root, on the branch you are deploying.

The migrator URL is set **inline, for the single command**. It is not written to `.env`, not
exported into the shell, and the form below keeps it out of shell history too (`read -rs`
does not echo and the assignment is a command prefix, not a stored variable in the
surviving environment).

```bash
# Git Bash on Windows, or any POSIX shell.
read -rsp "migrator (session pooler) URL: " MIGRATOR_URL; echo
read -rsp "orchard_app password: " APP_PW; echo

DATABASE_URL="$MIGRATOR_URL" ORCHARD_APP_DB_PASSWORD="$APP_PW" pnpm migrate:up

unset MIGRATOR_URL APP_PW
```

PowerShell has no inline environment prefix, so there the variables must be set and then
explicitly removed in the same block:

```powershell
$env:DATABASE_URL = Read-Host -Prompt "migrator URL" -MaskInput
$env:ORCHARD_APP_DB_PASSWORD = Read-Host -Prompt "orchard_app password" -MaskInput
try { pnpm migrate:up } finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ORCHARD_APP_DB_PASSWORD -ErrorAction SilentlyContinue
}
```

`db/migrate.ts` loads the root `.env` through `dotenv`, which does **not** override a value
already in the environment, so the inline value wins over anything in `.env`.

Expect `node-pg-migrate` to print each migration from `001_schemas_and_roles` through
`010_rwa_universe_current_view`. If it prints
`ORCHARD_APP_DB_PASSWORD not set - orchard_app role has no login password`, you omitted the
second variable; the app will not be able to connect. Re-run with both.

### DEC-014 on Supabase is UNTESTED

State this plainly, because it is the likeliest thing to fail here.

Migration `007_orchard_migrator_bootstrap` creates an `orchard_migrator` role (`NOLOGIN`)
and **reassigns ownership** of every `evidence` and `rwa` schema, table, view and trigger
function to it. DEC-014 records that this was verified against two shapes: this repository's
own dev/CI setup, and a throwaway container with a differently-named bootstrap user.

**Neither of those is Supabase.** Supabase's `postgres` role is not a superuser; it has
`CREATEROLE` and is a member of several platform roles, and the exact privileges it holds
over `ALTER ... OWNER TO` vary with Supabase's own platform changes. Whether migration 007
succeeds, or fails on a permission error, or succeeds while leaving ownership somewhere
unintended, **has never been observed on Supabase**. Do not write it down as working.

If 007 fails: it fails inside a single transaction, so the batch rolls back and the database
is left as it was. Capture the exact error, stop, and report it. Do not hand-edit the
database to get past it - the ownership model is the thing that keeps `orchard_app` unable
to change schema, and working around it silently removes that.

### Confirm the roles landed

```bash
read -rsp "migrator URL: " MIGRATOR_URL; echo
psql "$MIGRATOR_URL" -c "\du orchard_app" -c "\du orchard_migrator" \
  -c "\dn evidence rwa execution"
unset MIGRATOR_URL
```

`orchard_app` should have **no** attributes beyond login. If it shows `Superuser`,
`Create role` or `Create DB`, something went wrong - stop.

---

## 5. Build the application connection string

This is the one that goes into Render. Same host and port as the migrator URL, **different
username and password**:

```
postgresql://orchard_app.<project-ref>:<orchard_app password>@<same host>:5432/postgres
```

**UNVERIFIED:** through Supabase's pooler the username carries the project ref as a suffix
(`postgres.<project-ref>` is what the dashboard shows for the owner). Whether a
non-platform role created by a migration is addressed as `orchard_app.<project-ref>` or
plain `orchard_app` has not been confirmed on a real project. Test it before you deploy
rather than discovering it from a failing container:

```bash
read -rsp "candidate app URL: " APP_URL; echo
psql "$APP_URL" -c "select current_user, current_setting('server_version')" \
  -c "select count(*) from rwa.underlying"
unset APP_URL
```

`current_user` must come back `orchard_app`. If the connection is refused, try the other
username form before assuming the role or the password is wrong.

While you are there, confirm the privilege boundary actually holds:

```bash
# This MUST fail. If it succeeds, orchard_app is over-privileged - stop.
psql "$APP_URL" -c "create table public.should_not_exist (x int)"
```

---

## 6. Seed the universe snapshot

The app needs a `COMPLETE` universe snapshot before `/api/capabilities` can honestly report
`rwaDiscovery: true`. This makes **real, read-only** provider calls (`/rwa/platforms`,
`/rwa/tokens`, `/rwa/price`) and writes the result to the new database. Nothing is signed,
swapped or submitted.

Run it from your machine, against the production database, with the app role:

```bash
read -rsp "app URL: " APP_URL; echo
read -rsp "Binance Web3 API key: " BK; echo
read -rsp "Binance Web3 API secret: " BS; echo
read -rsp "evidence redaction salt: " SALT; echo

ORCHARD_APP_DATABASE_URL="$APP_URL" \
BINANCE_WEB3_API_KEY="$BK" \
BINANCE_WEB3_API_SECRET="$BS" \
BINANCE_WEB3_BASE_URL="https://web3.binance.com/build" \
TARGET_BINANCE_CHAIN_ID="56" \
EVIDENCE_REDACTION_SALT="$SALT" \
  pnpm universe:refresh

unset APP_URL BK BS SALT
```

On the **salt**: generate it once (`openssl rand -base64 36`) and keep it forever. It hashes
sensitive request parameters before they are stored in `evidence.redacted_request`. Changing
it later does not break the app, but it silently breaks correlation with every row written
before the change. The same value goes into Render in step 8.

Confirm the snapshot:

```bash
psql "$APP_URL" -c "select status, started_at, finished_at from evidence.probe_run order by started_at desc limit 3"
```

---

## 7. Create the Render Blueprint

`render.yaml` at the repository root is the blueprint. It declares one web service:
`runtime: docker`, `region: frankfurt`, `plan: starter`, `numInstances: 1`,
`healthCheckPath: /api/live`, `autoDeploy: false`.

1. Go to <https://dashboard.render.com> and sign in.
2. **New** → **Blueprint**.
3. Connect the GitHub account and pick the `orchard` repository. Grant access if Render
   asks. The repository is public, so this grants Render read access to something already
   public.
4. **Branch**: the branch you are deploying. Not `main` unless `main` is what you tested.
5. Render parses `render.yaml` and shows one service, `orchard-web`, plus a list of
   environment variables it needs values for - these are the five `sync: false` entries.
   Everything else is already filled in from the file; you should not have to type a region,
   a plan or an instance count.
6. **Apply** / **Create Resources**.

Confirm before continuing: region reads **Frankfurt**, plan reads **Starter**, instance
count reads **1**. If any of those differ from `render.yaml`, something was overridden in
the UI - fix it there, because one instance is a correctness requirement, not a cost choice
(the rate limiter is in-process, the provider's limit is per key, and a second instance
would double the budget against a limit that did not move).

### Why `autoDeploy: false`

A deploy is an owner action taken after the gates are green. The repository is public; a
push is not an approval.

---

## 8. Enter the secrets

In the service → **Environment**. Five keys, and nothing else needs touching - every
non-secret value is already set from `render.yaml`.

| Key                        | Value                                                           |
| -------------------------- | --------------------------------------------------------------- |
| `BINANCE_WEB3_API_KEY`     | from your password manager                                      |
| `BINANCE_WEB3_API_SECRET`  | from your password manager                                      |
| `ORCHARD_APP_DATABASE_URL` | the string built in step 5                                      |
| `EVIDENCE_REDACTION_SALT`  | the salt used in step 6 - the same one                          |
| `WEB_DIAG_TOKEN`           | a fresh 32+ character random string, **temporary** - see step 9 |

Do **not** add `DATABASE_URL`. The app does not use it, and a public-facing process must not
hold a credential that can drop schemas.

Paste carefully: a trailing space or newline in a connection string produces a connection
failure whose error message will not tell you that is why.

Then **Manual Deploy** → **Deploy latest commit**.

Watch the build log. It should end with a line like
`client bundle scan: 28 files, 3 secret values checked, no findings`. That is the post-build
scan in `apps/web/src/server/bundle-scan.ts`, and a finding fails the build - on Render
exactly as it does in CI, because it is wired into the package's own `build` script rather
than into a workflow.

---

## 9. First-deploy checks

Replace `<url>` with the service URL Render assigns (`https://orchard-web-xxxx.onrender.com`).

**1. Liveness.** This must be 200 and must touch nothing.

```bash
curl -s -w '\nstatus %{http_code}\n' https://<url>/api/live
```

**2. Readiness, and the measurement the whole deploy exists to make.**

```bash
curl -s -w '\nstatus %{http_code}\n' https://<url>/api/health
```

Read the `checks` object, not just the status:

- `checks.database.ok` → `true`. If false, the connection string or the username form from
  step 5 is wrong.
- `checks.provider.ok` → `true`. **This is the DEC-041 question.** `true` means the provider
  answered an authenticated call with **code 0** from Render's Frankfurt egress. That is the
  evidence F003 T0 asks for, and until you see it, nobody knows whether this host works.
  - If it is false with a **region block** or an **auth block**: stop. Do not retry from a
    different region, do not proxy. Report it. F003 section 7 is explicit.
  - If it is false with a timeout or a transport error, that is a different problem - retry
    once and then investigate.
- `checks.universe.ok` → `true`, with an age below 21600s. False means step 6 did not land
  or the snapshot has aged out.

`/api/health` answers **503** when any dependency is down, by design. A 503 here is a real
measurement, not a deployment failure - read the body.

**3. Capabilities are truthful.**

```bash
curl -s https://<url>/api/capabilities
```

Expect `rwaDiscovery: true`, `liveQuotes: true`, `bestExecution: true`, and every execution
flag (`transactionSimulation`, `mainnetExecution`, `agenticWallet`, `shareIntent`,
`fundedGifting`) `false`. These are computed from what the process can actually do. If
`liveQuotes` is false, check 2 already told you why.

**4. Measure the proxy hop count, then remove the tool.**

`WEB_TRUSTED_PROXY_HOPS` decides which `X-Forwarded-For` entry the rate limiter treats as
the client. `render.yaml` sets it to `1`, which is a guess about Render's routing. Too low
and a visitor can mint a fresh rate-limit bucket per request by sending their own header;
too high and everyone collapses into one shared bucket.

```bash
curl -s -H "x-orchard-diag-token: <the token from step 8>" https://<url>/api/diag
```

Read `forwardedChainLength`. Call it a few times, from more than one network if you can.

- Consistently `1` → the current setting is right. Nothing to change.
- Consistently `N` where N > 1 → set `WEB_TRUSTED_PROXY_HOPS` to `N` in `render.yaml`,
  commit it, and redeploy. Also check `clientIp` changes to your own address rather than a
  Render-internal one.
- Varying → report it rather than picking a number. A chain whose length is not stable means
  the hop assumption does not hold, and the limiter cannot be configured correctly from a
  guess.

**Then unset `WEB_DIAG_TOKEN`.** Render → Environment → delete the variable → save. The
route refuses with a 404 the moment the token is gone, and a 404 is what an unknown path
returns, so nothing advertises that the endpoint was ever there. Leave the token in place
only while you are actively measuring: it is an operator tool, it is not rate limited (on
purpose - the read limiter keys on the very IP derivation the route exists to diagnose), and
its only protection is the token's length.

**5. A fresh browser.** Open `https://<url>/` in a private window with no local setup.
Search a ticker, pick an amount, open a preview, open the "why" drawer. This is the external
acceptance F003 T5 asks for; the endpoint checks above are not a substitute for it.

---

## 10. The scheduled universe refresh (owner opt-in, costs money)

The stored snapshot ages out after 6 hours (`WEB_SNAPSHOT_MAX_AGE_SECONDS=21600`). After
that `/api/health` reports the universe stale and `/api/capabilities` stops claiming
`rwaDiscovery`. Either refresh by hand from your machine (step 6, which is fine for a
preview) or let Render do it on a schedule.

A cron entry is **present but commented out** at the bottom of `render.yaml`:
`orchard-universe-refresh`, every 3 hours (`0 */3 * * *`), built from `Dockerfile.jobs`.

It is commented out deliberately. **A Render cron job is a separately billed service.**
Applying the blueprint with the block live would create it and start charging without you
ever having chosen to.

**Confirm the cost on Render's own pricing page before you enable it:**
<https://render.com/pricing>. This repository does not quote Render's prices - a price
written down here is a price that goes stale and misleads whoever reads it next.

To opt in: uncomment the block, enter the four secrets for that service in the dashboard
(`BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_API_SECRET`, `ORCHARD_APP_DATABASE_URL`,
`EVIDENCE_REDACTION_SALT`), and re-apply the blueprint.

Note what the cron job does **not** get: `DATABASE_URL`. It connects as `orchard_app`,
because `INSERT` is all it needs.

**UNVERIFIED:** `Dockerfile.jobs` has not been built or run. Only the web `Dockerfile` has.

---

## 11. How to roll back

**The application.** Render keeps previous deploys.

1. Service → **Deploys**.
2. Find the last deploy that was good.
3. **⋯** → **Rollback to this deploy** (Render calls it "Redeploy" on some plans - either
   way it redeploys that commit's image).
4. Re-run the step 9 checks. A rollback that is not verified is a hope.

With `autoDeploy: false` nothing will deploy over your rollback on its own.

**A bad environment variable.** Change it in **Environment** and save. Render restarts the
service. This is the fast path and it is usually the right one: most "the deploy is broken"
situations are a connection string, not code.

**The database.** Think before you touch it.

A schema rollback is **not** a code rollback. Rolling a migration back can drop a table and
take real stored evidence with it. The app only ever `SELECT`s and `INSERT`s, so an older
app version against a newer schema is usually fine - prefer rolling back the app alone.

If you genuinely need to roll a migration back, it is `migrate:down` with an explicit count,
run from your machine with the migrator URL inline:

```bash
read -rsp "migrator URL: " MIGRATOR_URL; echo
DATABASE_URL="$MIGRATOR_URL" ORCHARD_ALLOW_DESTRUCTIVE_MIGRATION=1 pnpm migrate:down 1
unset MIGRATOR_URL
```

The count is **mandatory**. A bare `pnpm migrate:down` is refused, because it used to mean
"roll back everything" and that is how a local evidence database was destroyed during F003.
`pnpm migrate:reset` exists for a full rollback and needs its own variable
(`ORCHARD_ALLOW_FULL_RESET=1`) plus the database name typed back. **Never run `reset`
against the production database.** There is no undo and Supabase's point-in-time recovery is
not available on every plan - check what your project actually has before you need it.

**Full stop.** If the provider blocks the region, or anything suggests a secret has leaked:
Render → service → **Suspend**. That stops serving immediately without destroying anything.
Then rotate the Binance key and the `orchard_app` password before resuming.

---

## Appendix: running the production image locally

Useful for reproducing a problem without deploying.

```bash
docker build -t orchard-web:local .

docker run --rm -p 127.0.0.1:3900:3900 \
  --add-host host.docker.internal:host-gateway \
  -e PORT=3900 \
  -e ORCHARD_APP_DATABASE_URL="postgres://orchard_app:<your local app password>@host.docker.internal:5432/orchard" \
  -e BINANCE_WEB3_API_KEY="<your key>" \
  -e BINANCE_WEB3_API_SECRET="<your secret>" \
  -e BINANCE_WEB3_BASE_URL="https://web3.binance.com/build" \
  -e TARGET_BINANCE_CHAIN_ID="56" \
  -e EVIDENCE_REDACTION_SALT="<your salt>" \
  orchard-web:local
```

The image contains no secret and no `.env`; every value arrives at run time. The build stage
sets obviously-fake placeholders (`(docker build placeholder, not a key)`) only because
`apps/web/src/server/env.ts` fails closed on a missing **name**, and that stage is discarded

- it does not appear in the final image or in `docker history`.

To check that for yourself:

```bash
docker history --no-trunc orchard-web:local | grep -i -E 'binance|salt|password'
docker run --rm --entrypoint sh orchard-web:local -c 'find / -xdev -name ".env*"'
```

Both should print nothing.
