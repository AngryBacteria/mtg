import pino from "pino";

/** Browser logger for stable, structured diagnostics during client-side work. */
export const logger = pino({
	level: import.meta.env.DEV ? "debug" : "info",
	browser: { asObject: true },
});
