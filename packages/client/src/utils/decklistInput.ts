/** Normalized card identity or quantity field accepted by the CSV API. */
export type CsvCardField = "amount" | "collectorNumber" | "name" | "set";

/** A common line-oriented decklist layout offered as a starting point. */
export interface TextFormatPreset {
	label: string;
	format: string;
	example: string;
}

/**
 * Common export layouts from deck-building sites and general-purpose lists.
 *
 * Formats with printing information appear first because set plus collector
 * number identifies one printing, while the simpler choices remain useful for
 * Arena-style lists and lists containing names only.
 */
export const textFormatPresets: readonly TextFormatPreset[] = [
	{
		label: "Arena (quantity, name, set, collector number)",
		format: "{amount} {name} ({set}) {collectorNumber}",
		example: "1 Sol Ring (CMM) 396",
	},
	{
		label: "Quantity with x, name, set, collector number",
		format: "{amount}x {name} ({set}) {collectorNumber}",
		example: "1x Sol Ring (CMM) 396",
	},
	{
		label: "Quantity and card name",
		format: "{amount} {name}",
		example: "1 Sol Ring",
	},
	{ label: "Card name only", format: "{name}", example: "Sol Ring" },
	{
		label: "Set and collector number",
		format: "{set}/{collectorNumber}",
		example: "CMM/396",
	},
];

/** Header aliases whose meaning is specific enough to map without user input. */
const csvHeaderAliases: Readonly<Record<CsvCardField, readonly string[]>> = {
	amount: ["amount", "quantity", "qty", "count", "copies"],
	name: ["name", "card", "cardname"],
	set: ["set", "setcode", "edition", "editioncode", "expansion"],
	collectorNumber: [
		"collector",
		"collectornumber",
		"collectorno",
		"collectornum",
		"cardnumber",
		"number",
	],
};

/** Removes distinctions that commonly vary between equivalent CSV headers. */
function normalizeCsvHeader(header: string): string {
	return header.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Fills missing card-field mappings from recognizable CSV header names.
 *
 * Existing mappings are retained when their headers still exist, allowing a
 * user to correct a guess and continue editing CSV rows without losing it.
 * Automatic choices never reuse a header already assigned to another field.
 *
 * @param headers - Parsed headers in their source order.
 * @param currentMapping - User selections from the previous CSV value.
 * @returns Valid retained selections plus conservative alias-based guesses.
 */
export function inferCsvColumnMapping(
	headers: readonly string[],
	currentMapping: Partial<Record<CsvCardField, string>> = {},
): Partial<Record<CsvCardField, string>> {
	const mapping: Partial<Record<CsvCardField, string>> = {};
	const usedHeaders = new Set<string>();

	for (const field of Object.keys(csvHeaderAliases) as CsvCardField[]) {
		const selectedHeader = currentMapping[field];
		if (selectedHeader && headers.includes(selectedHeader)) {
			mapping[field] = selectedHeader;
			usedHeaders.add(selectedHeader);
		}
	}

	for (const field of Object.keys(csvHeaderAliases) as CsvCardField[]) {
		if (mapping[field]) continue;
		const aliases = csvHeaderAliases[field];
		const matchingHeader = headers.find(
			(header) =>
				!usedHeaders.has(header) &&
				aliases.includes(normalizeCsvHeader(header)),
		);
		if (matchingHeader) {
			mapping[field] = matchingHeader;
			usedHeaders.add(matchingHeader);
		}
	}

	return mapping;
}

/**
 * Extracts non-empty column names from the first RFC 4180-style CSV record.
 *
 * Quoted commas and escaped quotes are decoded, line breaks inside quoted values
 * remain part of the header, surrounding whitespace is trimmed, and a UTF-8 BOM
 * is removed from the first column. The complete CSV is validated by the server.
 */
export function parseCsvHeader(csv: string): string[] {
	const header: string[] = [];
	let value = "";
	let insideQuotes = false;

	for (let index = 0; index < csv.length; index += 1) {
		const character = csv[index];
		if (character === '"') {
			if (insideQuotes && csv[index + 1] === '"') {
				value += '"';
				index += 1;
			} else {
				insideQuotes = !insideQuotes;
			}
		} else if (character === "," && !insideQuotes) {
			header.push(value.trim());
			value = "";
		} else if ((character === "\n" || character === "\r") && !insideQuotes) {
			break;
		} else {
			value += character;
		}
	}

	if (value.length > 0 || header.length > 0) header.push(value.trim());
	return header
		.map((column, index) =>
			index === 0 ? column.replace(/^\uFEFF/u, "") : column,
		)
		.filter(Boolean);
}
