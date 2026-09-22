import { Pool, type PoolConfig } from "pg";

/**
 * Creates a pg Pool connected as orchard_app (least-privileged: INSERT +
 * SELECT on evidence/rwa tables only). Reads ORCHARD_APP_DATABASE_URL from
 * env; never accepts a connection string literal from a caller so a secret
 * can't accidentally be passed through application code.
 */
export function createAppPool(config: Omit<PoolConfig, "connectionString"> = {}): Pool {
  const connectionString = process.env["ORCHARD_APP_DATABASE_URL"];
  if (!connectionString) {
    throw new Error("Missing required env var ORCHARD_APP_DATABASE_URL");
  }
  return new Pool({ ...config, connectionString });
}
