import { z } from "zod";

/**
 * Defines and normalizes the server's supported process environment.
 *
 * Parsing happens once when this module loads, so an invalid value prevents the
 * server or database tooling from starting rather than failing later at use.
 */
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

/** Validated, immutable-by-convention runtime configuration shared by accessors. */
const env = envSchema.parse(process.env);

/**
 * Reads the validated TCP port on which the HTTP server should listen.
 *
 * The environment parser guarantees an integer from 1 through 65535 and uses
 * port 3000 when `PORT` is absent.
 */
export function getServerPort(): number {
	return env.PORT;
}

/**
 * Reports whether production-specific behavior should be enabled.
 *
 * This currently controls log formatting; unset `NODE_ENV` is treated as
 * development by the module-level environment validation.
 */
export function getIsProduction(): boolean {
	return env.NODE_ENV === "production";
}

/**
 * Reads the optional Pino log-level override after trimming whitespace.
 *
 * When undefined, the logger chooses a level appropriate to the runtime mode.
 */
export function getLogLevel(): string | undefined {
	return env.LOG_LEVEL;
}

/**
 * Reads the SQLite path passed to both the runtime driver and Drizzle Kit.
 *
 * Relative paths are resolved by the consumer's current working directory;
 * the default is `mtg.sqlite`.
 */
export function getDatabaseFileName(): string {
	return env.DB_FILE_NAME;
}

/**
 * Reports whether server startup should launch the default Scryfall import.
 *
 * Common string boolean representations are normalized by Zod. The import is
 * opt-in and runs asynchronously after the HTTP listener has started.
 */
export function getDownloadDefaultCardsOnStartup(): boolean {
	return env.DOWNLOAD_DEFAULT_CARDS_ON_STARTUP;
}
