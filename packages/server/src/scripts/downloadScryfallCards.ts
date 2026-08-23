import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { z } from "zod";
import { db } from "../database/db.js";
import { cards } from "../database/schema.js";
import { logger } from "../logger.js";

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

export type ScryfallCard = z.infer<typeof scryfallCardSchema>;

const parseBulkData = (data: unknown): BulkData | undefined => {
	const result = bulkDataSchema.safeParse(data);
	if (result.success) return result.data;

	logger.warn(
		{ err: result.error },
		"Could not parse the Scryfall bulk data response",
	);
	return undefined;
};

export const parseScryfallCard = (line: string): ScryfallCard | undefined => {
	try {
		const result = scryfallCardSchema.safeParse(JSON.parse(line));
		if (result.success) return result.data;

		logger.warn(
			{ err: result.error },
			"Could not parse a card from the Scryfall bulk download",
		);
	} catch (error) {
		logger.warn(
			{ err: error },
			"Could not parse a card from the Scryfall bulk download",
		);
	}

	return undefined;
};

const getJson = async (url: string): Promise<unknown> => {
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
};

export const downloadAndParseDefaultCards = async (
	handleCard: (card: ScryfallCard) => void | Promise<void>,
): Promise<{ count: number; updatedAt: string }> => {
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
		if (line.length === 0) continue;

		const card = parseScryfallCard(line);
		if (card === undefined) continue;

		await handleCard(card);
		count += 1;
	}

	return { count, updatedAt: bulkData.updated_at };
};

export const importDefaultCards = async (): Promise<{
	count: number;
	updatedAt: string;
}> => {
	logger.info(
		"Starting the import of all cards from scryfall",
	);
	const batch: (typeof cards.$inferInsert)[] = [];
	const writeBatch = async (): Promise<void> => {
		if (batch.length === 0) return;

		await db
			.insert(cards)
			.values(batch.splice(0))
			.onConflictDoNothing({ target: cards.id });
	};

	const result = await downloadAndParseDefaultCards(async (card) => {
		batch.push({
			id: card.id,
			name: card.name,
			set: card.set,
			collectorNumber: card.collector_number,
		});
		if (batch.length >= 100) await writeBatch();
	});

	await writeBatch();

	logger.info(
		{ cardCount: result.count, updatedAt: result.updatedAt },
		"Imported default cards",
	);

	return result;
};
