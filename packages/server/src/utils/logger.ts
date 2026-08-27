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

/** Emits backend logs at the configured level, with readable output outside production. */
export const logger = pino({
	level: logLevel,
	base: {
		environment: process.env.NODE_ENV ?? "development",
	},
	...loggerOptions,
});
