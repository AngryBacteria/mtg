/** Lists the placeholders that may extract values from an input card line. */
const cardFieldNames = ["amount", "collectorNumber", "name", "set"] as const;
type CardFieldName = (typeof cardFieldNames)[number];

/** Maps each field captured from a card line to its trimmed text value. */
export type ParsedCardFields = Partial<Record<CardFieldName, string>>;

const placeholderPattern = /\{([^{}]*)\}/gu;

/** Returns a lazy capture pattern that allows spaces in names but not in other fields. */
function cardFieldPattern(field: CardFieldName): string {
	if (field !== "name") {
		return "\\S+?";
	}

	return ".+?";
}

/** Escapes regular-expression syntax so a format's literal text matches verbatim. */
function escapeRegularExpression(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turns literal format text into a pattern that tolerates whitespace differences. */
function formatLiteralAsPattern(value: string): string {
	return escapeRegularExpression(value).replace(/\s+/g, "\\s+");
}

/** Rejects braces, escapes regex syntax, and lets whitespace match one or more spaces. */
function compileLiteral(value: string): string {
	if (value.includes("{") || value.includes("}")) {
		throw new Error("Format contains malformed braces");
	}
	return formatLiteralAsPattern(value);
}

/** Holds an anchored line-matching pattern and the fields it captures in order. */
export interface CompiledCardFormat {
	fields: readonly CardFieldName[];
	pattern: RegExp;
}

/** Converts a placeholder template such as `{amount} {name}` into a card-line matcher. */
export function compileCardFormat(format: string): CompiledCardFormat {
	const fields: CardFieldName[] = [];
	let pattern = "^\\s*";
	let literalStart = 0;

	for (const match of format.matchAll(placeholderPattern)) {
		const matchIndex = match.index;
		pattern += compileLiteral(format.slice(literalStart, matchIndex));
		const placeholder = match[1];
		if (!cardFieldNames.includes(placeholder as CardFieldName)) {
			pattern += formatLiteralAsPattern(match[0]);
			literalStart = matchIndex + match[0].length;
			continue;
		}
		const field = placeholder as CardFieldName;
		if (fields.includes(field)) {
			throw new Error(`Format field '${field}' may only be used once`);
		}

		fields.push(field);
		pattern += `(?<${field}>${cardFieldPattern(field)})`;
		literalStart = matchIndex + match[0].length;
	}

	pattern += compileLiteral(format.slice(literalStart));
	if (fields.length === 0) {
		throw new Error(
			"Format must contain {amount}, {name}, {set}, and/or {collectorNumber}",
		);
	}

	pattern += "\\s*$";
	return { fields, pattern: new RegExp(pattern, "iu") };
}

/** Extracts trimmed field values when a line fully matches the compiled template. */
export function parseCardLine(
	line: string,
	format: CompiledCardFormat,
): ParsedCardFields | undefined {
	const match = format.pattern.exec(line);
	if (!match?.groups) {
		return undefined;
	}

	const parsedFields: ParsedCardFields = {};
	for (const field of format.fields) {
		const value = match.groups[field]?.trim();
		if (!value) {
			return undefined;
		}
		parsedFields[field] = value;
	}

	return parsedFields;
}
