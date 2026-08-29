import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { getDatabaseFileName } from "../utils/process.js";

/**
 * Synchronous SQLite connection opened once when the database module loads.
 *
 * Opening may create the configured file when it does not exist. The process owns
 * this long-lived connection; individual queries do not open or close databases.
 */
const sqlite = new DatabaseSync(getDatabaseFileName());

/**
 * Shared Drizzle client for card imports and API lookups.
 *
 * Operations use Node's synchronous SQLite driver even though higher-level
 * workflows may expose promises for sequencing network and batch work.
 */
export const db = drizzle({ client: sqlite });
