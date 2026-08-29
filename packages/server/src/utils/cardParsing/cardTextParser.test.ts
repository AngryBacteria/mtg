import { describe, expect, it } from "vitest";
import { compileTextCardFormat, parseTextCardLine } from "./cardTextParser.js";

describe("compileCardFormat", () => {
	it.each([
		"{amount} {name} ({set}) {collectorNumber}",
		"name ({set}) {collectorNumber}",
		"Card name: {name}",
		"A set of {collectorNumber} cards: {name}",
	])("allows card field names in literal text in %s", (format) => {
		expect(() => compileTextCardFormat(format)).not.toThrow();
	});

	it.each(["{rarity} {name}", "{} {name}", "{Name} {set}"])(
		"allows the unknown braced text in %s",
		(format) => {
			expect(() => compileTextCardFormat(format)).not.toThrow();
		},
	);

	it.each(["{name", "name}", "{{name}}", "{name}}", "{{name}"])(
		"rejects malformed braces in %s",
		(format) => {
			expect(() => compileTextCardFormat(format)).toThrow();
		},
	);

	it.each([
		"{amount} - {amount}",
		"{name} - {name}",
		"{set}/{set}",
		"{collectorNumber} {collectorNumber}",
	])("rejects duplicate fields in %s", (format) => {
		expect(() => compileTextCardFormat(format)).toThrow(
			"may only be used once",
		);
	});

	it("rejects a format without a field", () => {
		expect(() => compileTextCardFormat("literal text only")).toThrow(
			"Format must contain {amount}, {name}, {set}, and/or {collectorNumber}",
		);
	});

	it("retains placeholders in their declared order", () => {
		const compiledFormat = compileTextCardFormat(
			"{collectorNumber}: {name} [{set}]",
		);
		expect(compiledFormat.fields).toEqual(["collectorNumber", "name", "set"]);
	});

	it.each(["", "   ", "{rarity}", "prefix {unknown} suffix"])(
		"rejects %j when it contains no supported field",
		(format) => {
			expect(() => compileTextCardFormat(format)).toThrow(
				"Format must contain {amount}, {name}, {set}, and/or {collectorNumber}",
			);
		},
	);

	it("exposes a case-insensitive, Unicode-aware regular expression", () => {
		const { pattern } = compileTextCardFormat("Karte: {name}");

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
		const format = compileTextCardFormat(
			"{amount} {name} ({set}) {collectorNumber}",
		);

		expect(parseTextCardLine(line, format)).toEqual(expected);
	});

	it("parses the requested three-field format", () => {
		const format = compileTextCardFormat("{name} ({set}) {collectorNumber}");
		expect(parseTextCardLine("Black Lotus (LEA) 232", format)).toEqual({
			name: "Black Lotus",
			set: "LEA",
			collectorNumber: "232",
		});
	});

	it.each([
		"1 Yoshimaru, Ever Faithful (SLD) 794 *F*",
		"1 Yoshimaru, Ever Faithful (SLD) 794 *F* signed copy",
	])("ignores metadata after a terminal collector number in %s", (line) => {
		const format = compileTextCardFormat(
			"{amount} {name} ({set}) {collectorNumber}",
		);

		expect(parseTextCardLine(line, format)).toEqual({
			amount: "1",
			name: "Yoshimaru, Ever Faithful",
			set: "SLD",
			collectorNumber: "794",
		});
	});

	it("ignores metadata after a terminal parenthesized set", () => {
		const format = compileTextCardFormat("{amount} {name} ({set})");

		expect(
			parseTextCardLine("1 Yoshimaru, Ever Faithful (SLD) 794 *F*", format),
		).toEqual({
			amount: "1",
			name: "Yoshimaru, Ever Faithful",
			set: "SLD",
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
		expect(parseTextCardLine(line, compileTextCardFormat(formatText))).toEqual(
			expected,
		);
	});

	it("treats regular-expression characters in literals as literal text", () => {
		const format = compileTextCardFormat(
			"Card.+ [{set}] ({collectorNumber}): {name}",
		);
		expect(
			parseTextCardLine("Card.+ [woe] (42): Beseech the Mirror", format),
		).toEqual({
			set: "woe",
			collectorNumber: "42",
			name: "Beseech the Mirror",
		});
		expect(
			parseTextCardLine("CardZZ [woe] (42): Beseech the Mirror", format),
		).toBeUndefined();
	});

	it("allows flexible whitespace and trims captured values", () => {
		const format = compileTextCardFormat("{name}   |   {set}");
		expect(parseTextCardLine("  Lightning Bolt\t |  \tLEA  ", format)).toEqual({
			name: "Lightning Bolt",
			set: "LEA",
		});
	});

	it("matches literal text without regard to case", () => {
		const format = compileTextCardFormat("Card: {name}");
		expect(parseTextCardLine("card: Mox Pearl", format)).toEqual({
			name: "Mox Pearl",
		});
	});

	it("treats unknown braced text as literal text", () => {
		const format = compileTextCardFormat("{rarity}: {name}");
		expect(parseTextCardLine("{rarity}: Black Lotus", format)).toEqual({
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
			? compileTextCardFormat("{amount} {name} [{set}] {collectorNumber}")
			: compileTextCardFormat("{amount} {name} ({set}) {collectorNumber}");

		expect(parseTextCardLine(line, format)).toEqual(expected);
	});

	it("parses fields independently of their conventional order", () => {
		const format = compileTextCardFormat(
			"{collectorNumber}/{set}: {name} x{amount}",
		);

		expect(parseTextCardLine("232/LEA: Black Lotus x4", format)).toEqual({
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
			expect(
				parseTextCardLine(line, compileTextCardFormat(formatText)),
			).toEqual(expected);
		},
	);

	it.each([
		["{amount}: {name}", "1 copy: Sol Ring"],
		["{set}/{collectorNumber}", "Modern Horizons/123"],
		["{name} ({set})", "Black Lotus (Limited Edition Alpha)"],
	])("rejects whitespace inside non-name fields for %s", (formatText, line) => {
		expect(
			parseTextCardLine(line, compileTextCardFormat(formatText)),
		).toBeUndefined();
	});

	it.each([
		["{name}", ""],
		["Card: {name}", "Card:   "],
		["{amount}: {name}", ": Black Lotus"],
		["{name} ({set})", "Black Lotus ()"],
		["{name} #{collectorNumber}", "Black Lotus #"],
	])("rejects an empty captured field in %s", (formatText, line) => {
		expect(
			parseTextCardLine(line, compileTextCardFormat(formatText)),
		).toBeUndefined();
	});

	it("requires the entire line to conform to the format", () => {
		const format = compileTextCardFormat("Card: {name} [end]");

		expect(
			parseTextCardLine("prefix Card: Sol Ring [end]", format),
		).toBeUndefined();
		expect(
			parseTextCardLine("Card: Sol Ring [end] suffix", format),
		).toBeUndefined();
		expect(parseTextCardLine("Card: Sol Ring [end]", format)).toEqual({
			name: "Sol Ring",
		});
	});

	it("reuses a compiled format across successful and failed parses", () => {
		const format = compileTextCardFormat("{name} [{set}]");

		expect(parseTextCardLine("Sol Ring [CMM]", format)).toEqual({
			name: "Sol Ring",
			set: "CMM",
		});
		expect(parseTextCardLine("not a card line", format)).toBeUndefined();
		expect(parseTextCardLine("Black Lotus [LEA]", format)).toEqual({
			name: "Black Lotus",
			set: "LEA",
		});
	});

	it.each(["", "   ", "Black Lotus LEA 232", "Black Lotus (LEA)"])(
		"returns undefined when %j does not match",
		(line) => {
			const format = compileTextCardFormat("{name} ({set}) {collectorNumber}");
			expect(parseTextCardLine(line, format)).toBeUndefined();
		},
	);
});
