export const getServerPort = () => Number.parseInt(process.env.PORT ?? "3000", 10);

export const getIsProduction = () => process.env.NODE_ENV === "production";

export const getLogLevel = () =>  process.env.LOG_LEVEL;