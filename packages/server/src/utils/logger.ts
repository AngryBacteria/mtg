import pino from "pino";
import { getIsProduction, getLogLevel } from "./process.js";

const logLevel = getLogLevel() ?? (getIsProduction() ? "info" : "debug");

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

/** Shared structured logger for the backend. */
export const logger = pino({
	level: logLevel,
	base: {
		environment: process.env.NODE_ENV ?? "development",
	},
	...loggerOptions,
});
