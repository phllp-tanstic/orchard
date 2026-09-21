import "dotenv/config";
import { buildTemplateDatabase, dropTemplateDatabase } from "./isolation.js";

/**
 * Vitest globalSetup for `pnpm test:integration` (DEC-017). Runs once,
 * before any integration test file opens a connection - builds the shared
 * template database each file then clones its own database from. See
 * isolation.ts for why this exists.
 */
export default async function setup(): Promise<() => Promise<void>> {
  await buildTemplateDatabase();
  return async () => {
    await dropTemplateDatabase();
  };
}
