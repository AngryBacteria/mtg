import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { z } from "zod";
import { db } from "../database/db.js";
import { cards } from "../database/schema.js";
import { logger } from "../utils/logger.js";

const DEFAULT_CARDS_URL = "https://api.scryfall.com/bulk-data/default_cards";

const bulkDataSchema = z.object({
	object: z.literal("bulk_data"),
	type: z.literal("default_cards"),
	updated_at: z.string(),
	jsonl_download_uri: z.url(),
	compressed_size: z.number(),
});

type BulkData = z.infer<typeof bulkDataSchema>;

const scryfallCardSchema = z.object({
	id: z.string(),
	name: z.string(),
	set: z.string(),
	collector_number: z.string(),
});

/** Contains the identity fields retained from a validated Scryfall card record. */
export type ScryfallCard = z.infer<typeof scryfallCardSchema>;

/** Returns validated Scryfall download metadata, or logs and skips invalid data. */
function parseBulkData(data: unknown): BulkData | undefined {
	const result = bulkDataSchema.safeParse(data);
	if (result.success) {
		return result.data;
	}

	logger.warn(
		{ err: result.error },
		"parseBulkData: Scryfall bulk data response was invalid",
	);
	return undefined;
}

/** Returns a validated card from one JSONL record, or logs and skips bad input. */
export function parseScryfallCard(line: string): ScryfallCard | undefined {
	try {
		const result = scryfallCardSchema.safeParse(JSON.parse(line));
		if (result.success) {
			return result.data;
		}

		logger.warn(
			{ err: result.error },
			"parseScryfallCard: Scryfall card record was invalid",
		);
	} catch (err) {
		logger.warn(
			{ err },
			"parseScryfallCard: Scryfall card record was not valid JSON",
		);
	}

	return undefined;
}

/** Fetches JSON from a URL and rejects unsuccessful HTTP responses. */
async function getJson(url: string): Promise<unknown> {
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "mtg/0.0.0",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Scryfall request failed: ${response.status} ${response.statusText}`,
		);
	}

	return response.json();
}

/** Streams Scryfall's default-card file and sends each valid record to a handler. */
export async function downloadAndParseDefaultCards(
	handleCard: (card: ScryfallCard) => void | Promise<void>,
): Promise<{ count: number; updatedAt: string }> {
	logger.info(
		{ source: DEFAULT_CARDS_URL },
		"downloadAndParseDefaultCards: download started",
	);

	const bulkData = parseBulkData(await getJson(DEFAULT_CARDS_URL));
	if (!bulkData) {
		throw new Error("Invalid Scryfall bulk data response");
	}

	const response = await fetch(bulkData.jsonl_download_uri, {
		headers: { "User-Agent": "mtg/0.0.0" },
	});

	if (!response.ok || response.body === null) {
		throw new Error(
			`Bulk download failed: ${response.status} ${response.statusText}`,
		);
	}

	const lines = createInterface({
		input: Readable.fromWeb(response.body).pipe(createGunzip()),
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	let count = 0;
	for await (const line of lines) {
		if (line.length === 0) {
			continue;
		}
		console.log(line);

		const card = parseScryfallCard(line);
		if (card === undefined) {
			continue;
		}

		await handleCard(card);
		count += 1;
	}

	const result = { count, updatedAt: bulkData.updated_at };
	logger.info(result, "downloadAndParseDefaultCards: download completed");

	return result;
}

/** Downloads Scryfall's default cards and inserts them in database-sized batches. */
export async function importDefaultCards(): Promise<{
	count: number;
	updatedAt: string;
}> {
	logger.info("importDefaultCards: import started");
	const batch: (typeof cards.$inferInsert)[] = [];

	/** Inserts the queued cards, then empties the batch for subsequent records. */
	const writeBatch = async (): Promise<void> => {
		if (batch.length === 0) {
			return;
		}

		const cardsToWrite = batch.splice(0);
		await db
			.insert(cards)
			.values(cardsToWrite)
			.onConflictDoNothing({ target: cards.id });
	};

	const result = await downloadAndParseDefaultCards(async (card) => {
		batch.push({
			id: card.id,
			name: card.name,
			set: card.set,
			collectorNumber: card.collector_number,
		});
		if (batch.length >= 100) {
			await writeBatch();
		}
	});

	await writeBatch();

	logger.info(
		{ cardCount: result.count, updatedAt: result.updatedAt },
		"importDefaultCards: import completed",
	);

	return result;
}
