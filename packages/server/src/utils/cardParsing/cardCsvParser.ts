import type { ParsedCardFields } from "./cardTextParser.js";

/**
 * Card properties that callers may map from source CSV columns.
 *
 * The list is shared with request validation so the API and parser accept the
 * same fields. `amount` is returned to the client but does not constrain lookup.
 */
export const searchableCardFields = [
	"amount",
	"name",
	"set",
	"collectorNumber",
] as const;

/** A card property accepted as the destination of a CSV column mapping. */
export type SearchableCardField = (typeof searchableCardFields)[number];

/**
 * Splits CSV source into rows while preserving the text of individual values.
 *
 * Commas and line endings inside quoted fields remain part of the value, doubled
 * quotes are unescaped, and CRLF is treated as one record separator. Whitespace
 * and empty records are retained here so mapping can apply its own normalization
 * and report source row numbers accurately.
 *
 * @throws When the input ends while a quoted field is still open.
 */
function parseCsvRows(csv: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
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
			row.push(value);
			value = "";
		} else if ((character === "\n" || character === "\r") && !insideQuotes) {
			row.push(value);
			rows.push(row);
			row = [];
			value = "";
			if (character === "\r" && csv[index + 1] === "\n") {
				index += 1;
			}
		} else {
			value += character;
		}
	}

	if (insideQuotes) {
		throw new Error("CSV contains an unterminated quoted value");
	}
	if (value.length > 0 || row.length > 0) {
		row.push(value);
		rows.push(row);
	}

	return rows;
}

/**
 * Converts CSV records into normalized fields used by card matching.
 *
 * Mapping keys must exactly match header text; only the first header permits a
 * UTF-8 BOM, which is removed before lookup. Blank records are ignored, mapped
 * values are trimmed, and unmapped source columns are discarded. Returned cards
 * preserve the order of non-blank data records.
 *
 * @param csv - RFC 4180-style text whose first record is the header.
 * @param columnMapping - Source header names mapped to supported card fields.
 * @returns Parsed fields for each non-blank data record in source order.
 * @throws When CSV quoting is malformed, the header is absent, a mapped header
 * is missing, or a non-blank record contains no populated mapped value.
 */
export function mapCsvRowsToCardFields(
	csv: string,
	columnMapping: Record<string, SearchableCardField>,
): ParsedCardFields[] {
	const rows = parseCsvRows(csv);
	const header = rows
		.shift()
		?.map((column, index) =>
			index === 0 ? column.replace(/^\uFEFF/u, "") : column,
		);
	if (
		header === undefined ||
		header.every((column) => column.trim().length === 0)
	) {
		throw new Error("CSV must contain a header row");
	}

	const mappedColumns = Object.entries(columnMapping).map(
		([csvColumn, cardField]) => {
			const columnIndex = header.indexOf(csvColumn);
			if (columnIndex === -1) {
				throw new Error(
					`Mapped CSV column "${csvColumn}" was not found in the header`,
				);
			}
			return { cardField, columnIndex };
		},
	);

	return rows
		.map((row, index) => ({ row, rowNumber: index + 2 }))
		.filter(({ row }) => row.some((value) => value.trim().length > 0))
		.map(({ row, rowNumber }) => {
			const parsedFields: ParsedCardFields = {};
			for (const { cardField, columnIndex } of mappedColumns) {
				const value = row[columnIndex]?.trim();
				if (value !== undefined && value.length > 0) {
					parsedFields[cardField] = value;
				}
			}
			if (Object.keys(parsedFields).length === 0) {
				throw new Error(`CSV row ${rowNumber} has no mapped card values`);
			}
			return parsedFields;
		});
}
