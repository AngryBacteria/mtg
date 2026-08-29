import { describe, expect, it } from "vitest";
import { mapCsvRowsToCardFields } from "./cardCsvParser.js";

const collectionCsv = `"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"
"1","1","Abrade","blc","Near Mint","English","","","2026-08-28 10:55:43.820000","191","False","False",""
"1","1","Academy Manufactor","blc","Near Mint","English","","","2026-08-28 10:57:05.087000","264","False","True",""
"1","1","Access Tunnel","ltc","Near Mint","English","","","2026-08-14 15:50:00.853000","294","False","False",""
"2","2","Adarkar Wastes","10e","Near Mint","English","","","2026-08-12 09:30:35.043000","347","False","True","3.84"
"1","1","Adarkar Wastes","eoc","Near Mint","English","","","2026-08-28 10:57:59.247000","147","False","False",""`;

describe("mapCsvRowsToCardFields", () => {
	it("maps collection CSV columns to searchable database fields", () => {
		expect(
			mapCsvRowsToCardFields(collectionCsv, {
				Name: "name",
				Edition: "set",
				"Collector Number": "collectorNumber",
			}),
		).toEqual([
			{ name: "Abrade", set: "blc", collectorNumber: "191" },
			{ name: "Academy Manufactor", set: "blc", collectorNumber: "264" },
			{ name: "Access Tunnel", set: "ltc", collectorNumber: "294" },
			{ name: "Adarkar Wastes", set: "10e", collectorNumber: "347" },
			{ name: "Adarkar Wastes", set: "eoc", collectorNumber: "147" },
		]);
	});

	it("rejects mappings whose source column is absent", () => {
		expect(() =>
			mapCsvRowsToCardFields(collectionCsv, { CardName: "name" }),
		).toThrow('Mapped CSV column "CardName" was not found in the header');
	});

	it("supports commas, escaped quotes, and newlines inside quoted values", () => {
		const csv = 'Name,Edition,Collector Number\n"A, B","S""LD","12\n3"';

		expect(
			mapCsvRowsToCardFields(csv, {
				Name: "name",
				Edition: "set",
				"Collector Number": "collectorNumber",
			}),
		).toEqual([{ name: "A, B", set: 'S"LD', collectorNumber: "12\n3" }]);
	});

	it("preserves an amount column for matched results", () => {
		const csv = "Count,Name,Edition,Collector Number\n2,Fire / Ice,MH2,290";

		expect(
			mapCsvRowsToCardFields(csv, {
				Count: "amount",
				Name: "name",
				Edition: "set",
				"Collector Number": "collectorNumber",
			}),
		).toEqual([
			{ amount: "2", name: "Fire / Ice", set: "MH2", collectorNumber: "290" },
		]);
	});
});
