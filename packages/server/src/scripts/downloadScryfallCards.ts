import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { z } from "zod";
import { db } from "../database/db.js";
import { cards } from "../database/schema.js";
import { logger } from "../utils/logger.js";

/** Scryfall metadata endpoint for the current default-card bulk export. */
const DEFAULT_CARDS_URL = "https://api.scryfall.com/bulk-data/default_cards";

/** Validates metadata needed to locate and describe the compressed card export. */
const bulkDataSchema = z.object({
	object: z.literal("bulk_data"),
	type: z.literal("default_cards"),
	updated_at: z.string(),
	jsonl_download_uri: z.url(),
	compressed_size: z.number(),
});

/** Validated metadata for one published default-card export. */
type BulkData = z.infer<typeof bulkDataSchema>;

/**
 * Validates identity fields required by the database while retaining every
 * additional Scryfall property in the stored JSON payload.
 */
const scryfallCardSchema = z.looseObject({
	id: z.string(),
	name: z.string(),
	set: z.string(),
	collector_number: z.string(),
});

/**
 * Complete Scryfall card record whose database identity fields are guaranteed.
 * Unknown properties remain available because the schema deliberately uses a
 * loose object rather than stripping the broader Scryfall payload.
 */
export type ScryfallCard = z.infer<typeof scryfallCardSchema>;

/**
 * Validates the metadata response required to start a bulk download.
 *
 * Invalid data is logged once at the validation boundary and represented as
 * `undefined`; the import coordinator turns that into a failed operation.
 */
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

/**
 * Parses and validates one JSONL record from Scryfall's bulk export.
 *
 * Malformed JSON and records missing required identity fields are recoverable:
 * they are logged and skipped so one bad line does not abort the full import.
 */
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

/**
 * Fetches a JSON resource using the application's identifying user agent.
 *
 * @returns The unvalidated decoded response body.
 * @throws When the network request fails, the response status is unsuccessful,
 * or the response body cannot be decoded as JSON.
 */
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

/**
 * Streams and validates Scryfall's current default-card export.
 *
 * The function first discovers the current gzip-compressed JSONL URL, then
 * decompresses it incrementally rather than buffering the export. Empty and
 * invalid records are skipped. Valid cards are passed to `handleCard` strictly in
 * source order, and each asynchronous handler invocation finishes before the next
 * line is consumed, providing backpressure for database writes.
 *
 * @param handleCard - Consumer invoked once for each valid record.
 * @returns The number of handled cards and Scryfall's export timestamp.
 * @throws For metadata, network, HTTP, body-stream, decompression, or handler
 * failures. Individual invalid card records do not reject the operation.
 */
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

/**
 * Downloads the current default-card export and persists new printings locally.
 *
 * Cards are inserted in batches of 100 to bound memory and statement size. A
 * final partial batch is flushed after the stream ends. Conflicts on Scryfall ID
 * are ignored, making repeat imports additive rather than replacing existing
 * payloads. The returned count is the number of valid records handled, including
 * IDs already present in the database, not the number of newly inserted rows.
 *
 * @returns Scryfall's valid record count and bulk-data update timestamp.
 * @throws When download, decompression, validation metadata, or a database batch
 * write fails. Earlier committed batches are not rolled back.
 */
export async function importDefaultCards(): Promise<{
	count: number;
	updatedAt: string;
}> {
	logger.info("importDefaultCards: import started");
	const batch: (typeof cards.$inferInsert)[] = [];

	/**
	 * Atomically claims the queued values and inserts them before accepting another
	 * streamed record, leaving the shared batch ready for subsequent cards.
	 */
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
			json: card,
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
