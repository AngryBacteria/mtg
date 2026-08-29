import { importDefaultCards } from "./scripts/downloadScryfallCards.js";
import { buildFastifyServer } from "./utils/fastifyServer.js";
import { logger } from "./utils/logger.js";
import {
	getDownloadDefaultCardsOnStartup,
	getServerPort,
} from "./utils/process.js";

/** Network interface used to make the service reachable outside localhost. */
const SERVER_HOST = "0.0.0.0";

/**
 * Starts the HTTP listener and optionally launches the Scryfall import.
 *
 * The optional import is intentionally not awaited, allowing API requests while
 * card data downloads; its rejection is handled and logged independently. A
 * listener startup failure is logged with its bind address and represented by a
 * non-zero process exit code rather than rethrown from the module entry point.
 */
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
