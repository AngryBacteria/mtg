import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { getDatabaseFileName } from "../utils/process.js";

const sqlite = new DatabaseSync(getDatabaseFileName());

export const db = drizzle({ client: sqlite });
