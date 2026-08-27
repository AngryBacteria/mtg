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

/** Reads the validated port on which the HTTP server should listen. */
export function getServerPort(): number {
	return env.PORT;
}

/** Reports whether the validated runtime environment is production. */
export function getIsProduction(): boolean {
	return env.NODE_ENV === "production";
}

/** Reads the optional validated Pino log-level override. */
export function getLogLevel(): string | undefined {
	return env.LOG_LEVEL;
}

/** Reads the validated SQLite file name used to open the application database. */
export function getDatabaseFileName(): string {
	return env.DB_FILE_NAME;
}

/** Reports whether startup should launch the default Scryfall card import. */
export function getDownloadDefaultCardsOnStartup(): boolean {
	return env.DOWNLOAD_DEFAULT_CARDS_ON_STARTUP;
}
