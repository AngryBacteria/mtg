import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Stores the searchable identity fields of cards imported from Scryfall. */
export const cards = sqliteTable(
	"cards",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		set: text().notNull(),
		collectorNumber: text().notNull(),
	},
	(table) => [
		index("cards_name_idx").on(table.name),
		check("cards_name_min_length", sql`length(${table.name}) >= 1`),
		check("cards_set_min_length", sql`length(${table.set}) >= 1`),
	],
);
