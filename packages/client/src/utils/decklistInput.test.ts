import { describe, expect, it } from "vitest";
import {
	inferCsvColumnMapping,
	parseCsvHeader,
	textFormatPresets,
} from "./decklistInput.ts";

describe("textFormatPresets", () => {
	it("offers printing-specific and name-based formats", () => {
		expect(textFormatPresets.map(({ format }) => format)).toEqual(
			expect.arrayContaining([
				"{amount} {name} ({set}) {collectorNumber}",
				"{amount}x {name} ({set}) {collectorNumber}",
				"{amount} {name}",
				"{name}",
				"{set}/{collectorNumber}",
			]),
		);
	});

	it("gives users a line example for every format", () => {
		for (const preset of textFormatPresets) {
			expect(preset.example.trim()).not.toBe("");
			expect(preset.example).not.toContain("{");
		}
	});
});

describe("parseCsvHeader", () => {
	it("parses quoted headers, escaped quotes, and a BOM", () => {
		expect(
			parseCsvHeader('\uFEFF"Card, Name","Set ""Code""",Quantity\r\n'),
		).toEqual(["Card, Name", 'Set "Code"', "Quantity"]);
	});
});

describe("inferCsvColumnMapping", () => {
	it("chooses all recognizable search fields regardless of case and punctuation", () => {
		expect(
			inferCsvColumnMapping(["Card Name", "SET_CODE", "Collector #", "Qty."]),
		).toEqual({
			amount: "Qty.",
			name: "Card Name",
			set: "SET_CODE",
			collectorNumber: "Collector #",
		});
	});

	it("supports common decklist exporter aliases", () => {
		expect(
			inferCsvColumnMapping(["Card", "Edition", "Card Number", "Copies"]),
		).toEqual({
			amount: "Copies",
			name: "Card",
			set: "Edition",
			collectorNumber: "Card Number",
		});
	});

	it("retains valid user choices and fills only missing fields", () => {
		expect(
			inferCsvColumnMapping(["Title", "Name", "Set", "Count"], {
				name: "Title",
				collectorNumber: "Removed column",
			}),
		).toEqual({ name: "Title", set: "Set", amount: "Count" });
	});

	it("does not guess unknown or ambiguous headers", () => {
		expect(inferCsvColumnMapping(["Title", "ID", "Notes"])).toEqual({});
	});
});
