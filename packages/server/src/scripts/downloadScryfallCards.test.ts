import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
	insert: vi.fn(),
	values: vi.fn(),
	onConflictDoNothing: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
	info: vi.fn(),
	warn: vi.fn(),
}));

vi.mock("../database/db.js", () => ({
	db: { insert: databaseMocks.insert },
}));

vi.mock("../utils/logger.js", () => ({ logger: loggerMocks }));

import {
	downloadAndParseDefaultCards,
	importDefaultCards,
	parseScryfallCard,
} from "./downloadScryfallCards.js";

const bulkData = {
	object: "bulk_data",
	type: "default_cards",
	updated_at: "2026-08-26T12:00:00Z",
	jsonl_download_uri: "https://example.com/default-cards.jsonl.gz",
	compressed_size: 123,
};

/** Wraps JSONL records in a successful response with a gzipped stream body. */
function createGzipResponse(lines: readonly string[]): Response {
	const compressedData = gzipSync(lines.join("\n"));
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(compressedData);
			controller.close();
		},
	});
	return new Response(body, { status: 200 });
}

/** Mocks the two Scryfall requests with metadata followed by gzipped card data. */
function mockScryfallResponses(
	lines: readonly string[],
): ReturnType<typeof vi.fn> {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json(bulkData))
		.mockResolvedValueOnce(createGzipResponse(lines));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

beforeEach(() => {
	databaseMocks.insert.mockReturnValue({ values: databaseMocks.values });
	databaseMocks.values.mockReturnValue({
		onConflictDoNothing: databaseMocks.onConflictDoNothing,
	});
	databaseMocks.onConflictDoNothing.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe("parseScryfallCard", () => {
	it("returns the complete JSON object from a valid card record", () => {
		expect(
			parseScryfallCard(
				JSON.stringify({
					id: "card-id",
					name: "Black Lotus",
					set: "lea",
					collector_number: "232",
					ignored: "value",
				}),
			),
		).toEqual({
			id: "card-id",
			name: "Black Lotus",
			set: "lea",
			collector_number: "232",
			ignored: "value",
		});
	});

	it.each(["not JSON", JSON.stringify({ id: "missing-fields" })])(
		"returns undefined for invalid input %j",
		(line) => {
			expect(parseScryfallCard(line)).toBeUndefined();
			expect(loggerMocks.warn).toHaveBeenCalledOnce();
		},
	);
});

describe("downloadAndParseDefaultCards", () => {
	it("streams valid cards, skips empty and invalid records, and returns metadata", async () => {
		const firstCard = {
			id: "one",
			name: "Black Lotus",
			set: "lea",
			collector_number: "232",
		};
		const secondCard = {
			id: "two",
			name: "Sol Ring",
			set: "lea",
			collector_number: "270",
		};
		const fetchMock = mockScryfallResponses([
			JSON.stringify(firstCard),
			"",
			"invalid JSON",
			JSON.stringify(secondCard),
		]);
		const handleCard = vi.fn();

		await expect(downloadAndParseDefaultCards(handleCard)).resolves.toEqual({
			count: 2,
			updatedAt: bulkData.updated_at,
		});
		expect(handleCard).toHaveBeenNthCalledWith(1, firstCard);
		expect(handleCard).toHaveBeenNthCalledWith(2, secondCard);
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"https://api.scryfall.com/bulk-data/default_cards",
			expect.objectContaining({ headers: expect.any(Object) }),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			bulkData.jsonl_download_uri,
			expect.objectContaining({ headers: expect.any(Object) }),
		);
	});

	it("rejects invalid bulk metadata without requesting the download", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ object: "error" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(downloadAndParseDefaultCards(vi.fn())).rejects.toThrow(
			"Invalid Scryfall bulk data response",
		);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it.each([
		[
			"metadata",
			503,
			"Service Unavailable",
			"Scryfall request failed: 503 Service Unavailable",
		],
		["download", 404, "Not Found", "Bulk download failed: 404 Not Found"],
	] as const)(
		"rejects a failed %s request",
		async (request, status, statusText, expectedMessage) => {
			const failedResponse = new Response(null, { status, statusText });
			const fetchMock = vi.fn();
			if (request === "download") {
				fetchMock.mockResolvedValueOnce(Response.json(bulkData));
			}
			fetchMock.mockResolvedValueOnce(failedResponse);
			vi.stubGlobal("fetch", fetchMock);

			await expect(downloadAndParseDefaultCards(vi.fn())).rejects.toThrow(
				expectedMessage,
			);
		},
	);
});

describe("importDefaultCards", () => {
	it("maps cards to database rows and writes batches of at most 100", async () => {
		const records = Array.from({ length: 205 }, (_, index) =>
			JSON.stringify({
				id: `id-${index}`,
				name: `Card ${index}`,
				set: "tst",
				collector_number: String(index),
				image_uris: { normal: `https://example.com/card-${index}.jpg` },
			}),
		);
		mockScryfallResponses(records);

		await expect(importDefaultCards()).resolves.toEqual({
			count: 205,
			updatedAt: bulkData.updated_at,
		});
		expect(databaseMocks.values).toHaveBeenCalledTimes(3);
		expect(
			databaseMocks.values.mock.calls.map(([rows]) => rows.length),
		).toEqual([100, 100, 5]);
		expect(databaseMocks.values).toHaveBeenNthCalledWith(
			1,
			expect.arrayContaining([
				{
					id: "id-0",
					json: {
						id: "id-0",
						name: "Card 0",
						set: "tst",
						collector_number: "0",
						image_uris: { normal: "https://example.com/card-0.jpg" },
					},
				},
			]),
		);
		expect(databaseMocks.onConflictDoNothing).toHaveBeenCalledTimes(3);
	});
});
