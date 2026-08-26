/** Field names supported by card-line format placeholders. */
const cardFieldNames = ["amount", "collectorNumber", "name", "set"] as const;
type CardFieldName = (typeof cardFieldNames)[number];
export type ParsedCardFields = Partial<Record<CardFieldName, string>>;

const placeholderPattern = /\{([^{}]*)\}/gu;

/** Returns the capture pattern appropriate for a card field. */
function cardFieldPattern(field: CardFieldName): string {
	if (field !== "name") {
		return "\\S+?";
	}

	return ".+?";
}

/** Escapes text so it can be safely included in a regular expression. */
function escapeRegularExpression(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Converts literal whitespace in a card format to flexible whitespace matching. */
function formatLiteralAsPattern(value: string): string {
	return escapeRegularExpression(value).replace(/\s+/g, "\\s+");
}

/** Validates and converts a literal format segment to a regular expression. */
function compileLiteral(value: string): string {
	if (value.includes("{") || value.includes("}")) {
		throw new Error("Format contains malformed braces");
	}
	return formatLiteralAsPattern(value);
}

/** Compiled representation of a card-line format. */
export interface CompiledCardFormat {
	fields: readonly CardFieldName[];
	pattern: RegExp;
}

/** Compiles a format whose card fields use braced placeholders such as `{name}`. */
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

/** Parses one card line according to a compiled card format. */
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
