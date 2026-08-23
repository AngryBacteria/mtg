import pino from "pino";
import { getIsProduction, getLogLevel } from "./utils/process.js";

const logLevelParsed = getLogLevel() ?? (getIsProduction() ? "info" : "debug");

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

export const logger = pino({
  level: logLevelParsed,
  base: {
    environment: process.env.NODE_ENV ?? "development",
  },
  ...loggerOptions,
});
