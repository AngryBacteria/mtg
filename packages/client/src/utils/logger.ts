import pino from "pino";

/**
 * Structured browser logger shared by client workflows.
 *
 * Development builds include diagnostic events while production starts at
 * informational events. Browser records are emitted as objects so structured
 * context and errors remain inspectable rather than being flattened into text.
 */
export const logger = pino({
	level: import.meta.env.DEV ? "debug" : "info",
	browser: { asObject: true },
});
