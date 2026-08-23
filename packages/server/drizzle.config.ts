import { defineConfig } from "drizzle-kit";
import { getDatabaseFileName } from "./src/utils/process.js";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/database/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: getDatabaseFileName(),
	},
});
