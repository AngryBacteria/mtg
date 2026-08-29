import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
	buildCardConditions,
	selectCardIdentityFields,
} from "./cardMatching.js";

const dialect = new SQLiteDialect();

/** Compiles matching conditions into their SQL text and bound parameters. */
function compileConditions(conditions: ReturnType<typeof buildCardConditions>) {
	return conditions.map((condition) => dialect.sqlToQuery(condition));
}

describe("selectCardIdentityFields", () => {
	it("uses set and collector number instead of a differently formatted name", () => {
		expect(
			selectCardIdentityFields({
				name: "Fire / Ice",
				set: "MH2",
				collectorNumber: "290",
			}),
		).toEqual({ set: "mh2", collectorNumber: "290" });
	});

	it("retains the name when the printing identity is incomplete", () => {
		expect(
			selectCardIdentityFields({ name: "Fire / Ice", set: " MH2 " }),
		).toEqual({ name: "Fire / Ice", set: "mh2" });
	});

	it("normalizes collector-number letter casing", () => {
		expect(
			selectCardIdentityFields({ set: "SLD", collectorNumber: " 42A " }),
		).toEqual({ set: "sld", collectorNumber: "42a" });
	});
});

describe("buildCardConditions", () => {
	it("builds an exact name condition when only a name identifies the card", () => {
		expect(
			compileConditions(buildCardConditions({ name: "Black Lotus" })),
		).toEqual([{ sql: '"cards"."name" = ?', params: ["Black Lotus"] }]);
	});

	it("prefers normalized printing fields over the supplied name", () => {
		expect(
			compileConditions(
				buildCardConditions({
					name: "Fire / Ice",
					set: " MH2 ",
					collectorNumber: " 290A ",
				}),
			),
		).toEqual([
			{ sql: '"cards"."set" = ?', params: ["mh2"] },
			{
				sql: '"cards"."collector_number" = ? collate nocase',
				params: ["290a"],
			},
		]);
	});

	it("retains all available fields when the printing identity is incomplete", () => {
		expect(
			compileConditions(
				buildCardConditions({ name: "Fire / Ice", set: " MH2 " }),
			),
		).toEqual([
			{ sql: '"cards"."name" = ?', params: ["Fire / Ice"] },
			{ sql: '"cards"."set" = ?', params: ["mh2"] },
		]);
	});

	it("returns no conditions when no identity fields are present", () => {
		expect(buildCardConditions({ amount: "2" })).toEqual([]);
	});
});
