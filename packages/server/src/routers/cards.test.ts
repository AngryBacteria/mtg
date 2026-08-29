import { describe, expect, it, vi } from "vitest";

vi.mock("../database/db.js", async () => {
	const { DatabaseSync } = await import("node:sqlite");
	const { drizzle } = await import("drizzle-orm/node-sqlite");
	const sqlite = new DatabaseSync(":memory:");
	sqlite.exec(`
		CREATE TABLE cards (
			id TEXT PRIMARY KEY,
			json TEXT NOT NULL,
			name TEXT GENERATED ALWAYS AS (json_extract(json, '$.name')) STORED NOT NULL,
			"set" TEXT GENERATED ALWAYS AS (json_extract(json, '$.set')) STORED NOT NULL,
			collector_number TEXT GENERATED ALWAYS AS (json_extract(json, '$.collector_number')) STORED NOT NULL
		);
		INSERT INTO cards (id, json) VALUES (
			'fire-ice-mh2',
			'{"name":"Fire // Ice","set":"mh2","collector_number":"290"}'
		);
	`);
	return { db: drizzle({ client: sqlite }) };
});

vi.mock("../utils/logger.js", () => ({
	logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { cardsRouter } from "./cards.js";

const caller = cardsRouter.createCaller({});

describe("cardsRouter", () => {
	it("matches a split card by normalized set and collector number", async () => {
		const result = await caller.parseText({
			cards: "2 Fire / Ice (MH2) 290",
			format: "{amount} {name} ({set}) {collectorNumber}",
		});

		expect(result.unmatched).toEqual([]);
		expect(result.matches).toMatchObject([
			{
				amount: "2",
				collectorNumber: "290",
				id: "fire-ice-mh2",
				inputIndex: 0,
				name: "Fire // Ice",
				set: "mh2",
			},
		]);
	});

	it("returns parsed details for unmatched inputs", async () => {
		const result = await caller.parseText({
			cards: "3 Missing Card (ABC) 42A",
			format: "{amount} {name} ({set}) {collectorNumber}",
		});

		expect(result.matches).toEqual([]);
		expect(result.unmatched).toEqual([
			{
				inputIndex: 0,
				parsedFields: {
					amount: "3",
					collectorNumber: "42A",
					name: "Missing Card",
					set: "ABC",
				},
			},
		]);
	});
});
