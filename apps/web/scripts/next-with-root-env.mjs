#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Runs `next <args>` with the repository-root .env loaded.
 *
 * Every other entrypoint in this repo (the probes, the migrator, the
 * integration tests) reads the root .env, but Next only looks in its own
 * directory. Without this, `pnpm web:dev` and `pnpm web:start` start and then
 * fail closed on the environment gate - which is the gate behaving correctly,
 * but it makes the app unrunnable locally.
 *
 * Node's own `--env-file-if-exists` does the loading, so this adds no
 * dependency and, importantly, does NOT require the file: in a deployment the
 * environment comes from the platform and there is no .env at all.
 *
 * Values are never read, printed or logged here - the file is handed to node
 * and nothing in this process looks inside it.
 */
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
// The JS entrypoint, not the .bin shim: this is run through node directly so
// that node gets the --env-file flag.
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

if (!existsSync(nextBin)) {
  console.error(`Cannot find the next binary at ${nextBin}. Run pnpm install.`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [`--env-file-if-exists=${repoRoot}.env`, nextBin, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
