import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Represents the complete JSON object returned for a card by Scryfall. */
export type ScryfallCardJson = Record<string, unknown>;

/** Stores searchable card fields alongside the complete Scryfall response. */
export const cards = sqliteTable(
	"cards",
	{
		id: text().primaryKey(),
		json: text({ mode: "json" }).$type<ScryfallCardJson>().notNull(),
		name: text().generatedAlwaysAs(sql`json_extract(json, '$.name')`).notNull(),
		set: text().generatedAlwaysAs(sql`json_extract(json, '$.set')`).notNull(),
		collectorNumber: text("collector_number")
			.generatedAlwaysAs(sql`json_extract(json, '$.collector_number')`)
			.notNull(),
	},
	(table) => [
		index("cards_name_idx").on(table.name),
		index("cards_set_collector_number_idx").on(
			table.set,
			sql`${table.collectorNumber} collate nocase`,
		),
		check("cards_name_min_length", sql`length(${table.name}) >= 1`),
		check("cards_set_min_length", sql`length(${table.set}) >= 1`),
		check("cards_collectorNumber_min_length", sql`length(${table.collectorNumber}) >= 1`),
	],
);
