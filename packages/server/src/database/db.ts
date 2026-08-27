import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { getDatabaseFileName } from "../utils/process.js";

const sqlite = new DatabaseSync(getDatabaseFileName());

/** Provides queries against the configured SQLite database through Drizzle. */
export const db = drizzle({ client: sqlite });
