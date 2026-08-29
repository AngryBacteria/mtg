import { defineConfig } from "drizzle-kit";
import { getDatabaseFileName } from "./src/utils/process.js";

/**
 * Configures Drizzle Kit to manage the same SQLite database used at runtime.
 *
 * The database URL comes from validated environment configuration, while schema
 * snapshots and migrations are emitted beneath `packages/server/drizzle`.
 */
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/database/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: getDatabaseFileName(),
	},
});
