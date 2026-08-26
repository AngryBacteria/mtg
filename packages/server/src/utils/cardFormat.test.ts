import { describe, expect, it } from "vitest";
import { compileCardFormat, parseCardLine } from "./cardFormat.js";

describe("compileCardFormat", () => {
	it.each([
		"{amount} {name} ({set}) {collectorNumber}",
		"name ({set}) {collectorNumber}",
		"Card name: {name}",
		"A set of {collectorNumber} cards: {name}",
	])("allows card field names in literal text in %s", (format) => {
		expect(() => compileCardFormat(format)).not.toThrow();
	});

	it.each(["{rarity} {name}", "{} {name}", "{Name} {set}"])(
		"allows the unknown braced text in %s",
		(format) => {
			expect(() => compileCardFormat(format)).not.toThrow();
		},
	);

	it.each(["{name", "name}", "{{name}}", "{name}}", "{{name}"])(
		"rejects malformed braces in %s",
		(format) => {
			expect(() => compileCardFormat(format)).toThrow();
		},
	);

	it.each([
		"{amount} - {amount}",
		"{name} - {name}",
		"{set}/{set}",
		"{collectorNumber} {collectorNumber}",
	])("rejects duplicate fields in %s", (format) => {
		expect(() => compileCardFormat(format)).toThrow("may only be used once");
	});

	it("rejects a format without a field", () => {
		expect(() => compileCardFormat("literal text only")).toThrow(
			"Format must contain {amount}, {name}, {set}, and/or {collectorNumber}",
		);
	});

	it("retains placeholders in their declared order", () => {
		const compiledFormat = compileCardFormat(
			"{collectorNumber}: {name} [{set}]",
		);
		expect(compiledFormat.fields).toEqual(["collectorNumber", "name", "set"]);
	});

	it.each(["", "   ", "{rarity}", "prefix {unknown} suffix"])(
		"rejects %j when it contains no supported field",
		(format) => {
			expect(() => compileCardFormat(format)).toThrow(
				"Format must contain {amount}, {name}, {set}, and/or {collectorNumber}",
			);
		},
	);

	it("exposes a case-insensitive, Unicode-aware regular expression", () => {
		const { pattern } = compileCardFormat("Karte: {name}");

		expect(pattern.flags).toContain("i");
		expect(pattern.flags).toContain("u");
	});
});

describe("parseCardLine", () => {
	it.each([
		[
			"1 Ghyrson Starn, Kelermorph (40K) 124",
			{
				amount: "1",
				name: "Ghyrson Starn, Kelermorph",
				set: "40K",
				collectorNumber: "124",
			},
		],
		[
			"1 An Offer You Can't Refuse (SNC) 51",
			{
				amount: "1",
				name: "An Offer You Can't Refuse",
				set: "SNC",
				collectorNumber: "51",
			},
		],
		[
			"1 Fire / Ice (MH2) 290",
			{
				amount: "1",
				name: "Fire / Ice",
				set: "MH2",
				collectorNumber: "290",
			},
		],
		[
			"1 My Card (Special Edition) (ABC) 42",
			{
				amount: "1",
				name: "My Card (Special Edition)",
				set: "ABC",
				collectorNumber: "42",
			},
		],
	])("parses an amount from %s", (line, expected) => {
		const format = compileCardFormat(
			"{amount} {name} ({set}) {collectorNumber}",
		);

		expect(parseCardLine(line, format)).toEqual(expected);
	});

	it("parses the requested three-field format", () => {
		const format = compileCardFormat("{name} ({set}) {collectorNumber}");
		expect(parseCardLine("Black Lotus (LEA) 232", format)).toEqual({
			name: "Black Lotus",
			set: "LEA",
			collectorNumber: "232",
		});
	});

	it.each([
		["{name}", "Sol Ring", { name: "Sol Ring" }],
		[
			"{set}/{collectorNumber}",
			"mh2/123",
			{ set: "mh2", collectorNumber: "123" },
		],
		[
			"[{set}] {name}",
			"[MKM] Delney, Streetwise Lookout",
			{ set: "MKM", name: "Delney, Streetwise Lookout" },
		],
	])("parses %s from %s", (formatText, line, expected) => {
		expect(parseCardLine(line, compileCardFormat(formatText))).toEqual(
			expected,
		);
	});

	it("treats regular-expression characters in literals as literal text", () => {
		const format = compileCardFormat(
			"Card.+ [{set}] ({collectorNumber}): {name}",
		);
		expect(
			parseCardLine("Card.+ [woe] (42): Beseech the Mirror", format),
		).toEqual({
			set: "woe",
			collectorNumber: "42",
			name: "Beseech the Mirror",
		});
		expect(
			parseCardLine("CardZZ [woe] (42): Beseech the Mirror", format),
		).toBeUndefined();
	});

	it("allows flexible whitespace and trims captured values", () => {
		const format = compileCardFormat("{name}   |   {set}");
		expect(parseCardLine("  Lightning Bolt\t |  \tLEA  ", format)).toEqual({
			name: "Lightning Bolt",
			set: "LEA",
		});
	});

	it("matches literal text without regard to case", () => {
		const format = compileCardFormat("Card: {name}");
		expect(parseCardLine("card: Mox Pearl", format)).toEqual({
			name: "Mox Pearl",
		});
	});

	it("treats unknown braced text as literal text", () => {
		const format = compileCardFormat("{rarity}: {name}");
		expect(parseCardLine("{rarity}: Black Lotus", format)).toEqual({
			name: "Black Lotus",
		});
	});

	it.each([
		[
			"2x Æther Gust [M20] #42a",
			{
				amount: "2x",
				name: "Æther Gust",
				set: "M20",
				collectorNumber: "#42a",
			},
		],
		[
			"1 Éowyn, Fearless Knight (LTR) 201★",
			{
				amount: "1",
				name: "Éowyn, Fearless Knight",
				set: "LTR",
				collectorNumber: "201★",
			},
		],
	])("preserves punctuation and Unicode when parsing %s", (line, expected) => {
		const format = line.includes("[")
			? compileCardFormat("{amount} {name} [{set}] {collectorNumber}")
			: compileCardFormat("{amount} {name} ({set}) {collectorNumber}");

		expect(parseCardLine(line, format)).toEqual(expected);
	});

	it("parses fields independently of their conventional order", () => {
		const format = compileCardFormat(
			"{collectorNumber}/{set}: {name} x{amount}",
		);

		expect(parseCardLine("232/LEA: Black Lotus x4", format)).toEqual({
			collectorNumber: "232",
			set: "LEA",
			name: "Black Lotus",
			amount: "4",
		});
	});

	it.each([
		["{amount} {name}", "1 0 Ring", { amount: "1", name: "0 Ring" }],
		[
			"{name} ({set})",
			"Wear // Tear (DGM)",
			{ name: "Wear // Tear", set: "DGM" },
		],
		[
			"{set}-{collectorNumber}",
			"SLD-1234",
			{ set: "SLD", collectorNumber: "1234" },
		],
	])(
		"uses literals to delimit adjacent field values for %s",
		(formatText, line, expected) => {
			expect(parseCardLine(line, compileCardFormat(formatText))).toEqual(
				expected,
			);
		},
	);

	it.each([
		["{amount}: {name}", "1 copy: Sol Ring"],
		["{set}/{collectorNumber}", "Modern Horizons/123"],
		["{name} ({set})", "Black Lotus (Limited Edition Alpha)"],
	])("rejects whitespace inside non-name fields for %s", (formatText, line) => {
		expect(parseCardLine(line, compileCardFormat(formatText))).toBeUndefined();
	});

	it.each([
		["{name}", ""],
		["Card: {name}", "Card:   "],
		["{amount}: {name}", ": Black Lotus"],
		["{name} ({set})", "Black Lotus ()"],
		["{name} #{collectorNumber}", "Black Lotus #"],
	])("rejects an empty captured field in %s", (formatText, line) => {
		expect(parseCardLine(line, compileCardFormat(formatText))).toBeUndefined();
	});

	it("requires the entire line to conform to the format", () => {
		const format = compileCardFormat("Card: {name} [end]");

		expect(
			parseCardLine("prefix Card: Sol Ring [end]", format),
		).toBeUndefined();
		expect(
			parseCardLine("Card: Sol Ring [end] suffix", format),
		).toBeUndefined();
		expect(parseCardLine("Card: Sol Ring [end]", format)).toEqual({
			name: "Sol Ring",
		});
	});

	it("reuses a compiled format across successful and failed parses", () => {
		const format = compileCardFormat("{name} [{set}]");

		expect(parseCardLine("Sol Ring [CMM]", format)).toEqual({
			name: "Sol Ring",
			set: "CMM",
		});
		expect(parseCardLine("not a card line", format)).toBeUndefined();
		expect(parseCardLine("Black Lotus [LEA]", format)).toEqual({
			name: "Black Lotus",
			set: "LEA",
		});
	});

	it.each(["", "   ", "Black Lotus LEA 232", "Black Lotus (LEA)"])(
		"returns undefined when %j does not match",
		(line) => {
			const format = compileCardFormat("{name} ({set}) {collectorNumber}");
			expect(parseCardLine(line, format)).toBeUndefined();
		},
	);
});
