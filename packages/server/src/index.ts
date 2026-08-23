import { logger } from "./logger.js";
import { importDefaultCards } from "./scripts/downloadScryfallCards.js";
import { buildFastifyServer } from "./utils/fastifyServer.js";
import {
	getDownloadDefaultCardsOnStartup,
	getServerPort,
} from "./utils/process.js";

const server = buildFastifyServer();
const port = getServerPort();

try {
	await server.listen({ port: port, host: "0.0.0.0" });
	logger.info({ port }, "Started server");

	if (getDownloadDefaultCardsOnStartup()) {
		void importDefaultCards().catch((error: unknown) => {
			logger.error({ err: error }, "Failed to import default cards");
		});
	}
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
