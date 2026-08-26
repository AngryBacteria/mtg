import { importDefaultCards } from "./scripts/downloadScryfallCards.js";
import { buildFastifyServer } from "./utils/fastifyServer.js";
import { logger } from "./utils/logger.js";
import {
	getDownloadDefaultCardsOnStartup,
	getServerPort,
} from "./utils/process.js";

const SERVER_HOST = "0.0.0.0";

/** Starts the HTTP server and optional background card import. */
async function main(): Promise<void> {
	const server = buildFastifyServer();
	const port = getServerPort();

	try {
		await server.listen({ port, host: SERVER_HOST });
		logger.info({ host: SERVER_HOST, port }, "main: server started");

		if (getDownloadDefaultCardsOnStartup()) {
			void importDefaultCards().catch((err: unknown) => {
				logger.error({ err }, "main: default card import failed");
			});
		}
	} catch (err) {
		logger.error(
			{
				err,
				host: SERVER_HOST,
				port,
			},
			"main: server startup failed",
		);
		process.exitCode = 1;
	}
}

await main();
