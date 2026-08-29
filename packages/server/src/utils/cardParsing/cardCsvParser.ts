import type { ParsedCardFields } from "./cardTextParser.js";

/** Parsed card fields that CSV columns may populate for matching and quantities. */
export const searchableCardFields = [
	"amount",
	"name",
	"set",
	"collectorNumber",
] as const;

/** A database card field that can be populated from a CSV column. */
export type SearchableCardField = (typeof searchableCardFields)[number];

/** Parses RFC 4180-style comma-separated data, including escaped and multiline values. */
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

/** Maps CSV records to card fields using source-column-to-database-field mappings. */
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
