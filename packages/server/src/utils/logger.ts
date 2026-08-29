import pino from "pino";
import { getIsProduction, getLogLevel } from "./process.js";

/** Effective minimum Pino level, with quieter production defaults. */
const logLevel = getLogLevel() ?? (getIsProduction() ? "info" : "debug");

/** Enables human-readable transport formatting only outside production. */
const loggerOptions = !getIsProduction()
	? {
			transport: {
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "SYS:standard",
				},
			},
		}
	: {};

/**
 * Shared structured logger for server lifecycle, request, parsing, and import events.
 *
 * Production emits machine-readable JSON. Development and test environments use
 * `pino-pretty`; all records include the validated runtime environment as base
 * context and respect `LOG_LEVEL` when provided.
 */
export const logger = pino({
	level: logLevel,
	base: {
		environment: process.env.NODE_ENV ?? "development",
	},
	...loggerOptions,
});
