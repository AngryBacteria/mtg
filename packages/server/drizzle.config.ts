import { defineConfig } from "drizzle-kit";
import { getDatabaseFileName } from "./src/utils/process.js";

/** Points Drizzle Kit at the card schema and configured SQLite database file. */
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/database/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: getDatabaseFileName(),
	},
});
