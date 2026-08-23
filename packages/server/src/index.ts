import { logger } from "./logger.js";
import { buildFastifyServer } from "./utils/fastifyServer.js";
import { getServerPort } from "./utils/process.js";

const server = buildFastifyServer();
const port = getServerPort();

try {
  await server.listen({ port: port, host: "0.0.0.0" });
  logger.info({ port }, "Started server");
} catch (error) {
  logger.error(
    {
      err: error,
      host: "0.0.0.0",
      port,
    },
    "Failed to start server",
  );
  process.exit(1);
}
