import { z } from "zod";

const envSchema = z.object({
	PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	LOG_LEVEL: z.string().trim().min(1).optional(),
	DB_FILE_NAME: z.string().trim().min(1).default("mtg.sqlite"),
	DOWNLOAD_DEFAULT_CARDS_ON_STARTUP: z
		.preprocess(
			(value) => (typeof value === "string" ? value.trim() : value),
			z.stringbool(),
		)
		.default(false),
});

const env = envSchema.parse(process.env);

/** Returns the port on which the HTTP server should listen. */
export function getServerPort(): number {
	return env.PORT;
}

/** Returns whether the server is running in production mode. */
export function getIsProduction(): boolean {
	return env.NODE_ENV === "production";
}

/** Returns the configured Pino log level, if one was provided. */
export function getLogLevel(): string | undefined {
	return env.LOG_LEVEL;
}

/** Returns the configured SQLite database file name. */
export function getDatabaseFileName(): string {
	return env.DB_FILE_NAME;
}

/** Returns whether the default Scryfall cards should be imported at startup. */
export function getDownloadDefaultCardsOnStartup(): boolean {
	return env.DOWNLOAD_DEFAULT_CARDS_ON_STARTUP;
}
