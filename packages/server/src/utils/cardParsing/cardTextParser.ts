/** Supported placeholder names and the canonical order used for type inference. */
const cardFieldNames = ["amount", "collectorNumber", "name", "set"] as const;
/** A field that a custom decklist format may capture from each input line. */
type CardFieldName = (typeof cardFieldNames)[number];

/**
 * Values extracted from one decklist line before database matching.
 *
 * Fields are optional because custom formats may identify cards using any subset.
 * `amount` is presentation metadata; the remaining fields can constrain lookup.
 */
export type ParsedCardFields = Partial<Record<CardFieldName, string>>;

/** Finds brace-delimited placeholders while leaving validation to the compiler. */
const placeholderPattern = /\{([^{}]*)\}/gu;

/**
 * Returns the capture fragment for a supported field.
 *
 * Names may contain whitespace, while quantities, set codes, and collector
 * numbers are token-like values. Lazy matching lets following format literals
 * determine capture boundaries.
 */
function cardFieldPattern(field: CardFieldName): string {
	if (field !== "name") {
		return "\\S+?";
	}

	return ".+?";
}

/** Escapes regular-expression metacharacters in user-authored format literals. */
function escapeRegularExpression(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles literal format text while allowing runs of whitespace to vary.
 * Punctuation and other regular-expression syntax continue to match verbatim.
 */
function formatLiteralAsPattern(value: string): string {
	return escapeRegularExpression(value).replace(/\s+/g, "\\s+");
}

/**
 * Compiles a literal segment and rejects unmatched braces as malformed syntax.
 *
 * @throws When the segment contains a brace not consumed as a placeholder.
 */
function compileLiteral(value: string): string {
	if (value.includes("{") || value.includes("}")) {
		throw new Error("Format contains malformed braces");
	}
	return formatLiteralAsPattern(value);
}

/**
 * Reusable representation of a validated custom decklist format.
 *
 * `pattern` matches a complete input line and exposes named capture groups;
 * `fields` defines which groups must be present and their extraction order.
 */
export interface CompiledCardFormat {
	fields: readonly CardFieldName[];
	pattern: RegExp;
}

/**
 * Converts a placeholder template into a reusable, case-insensitive line matcher.
 *
 * Supported placeholders capture amount, name, set, or collector number. Unknown
 * placeholders are treated as literal text for compatibility with brace-bearing
 * source formats, while duplicate supported fields are rejected. Leading and
 * trailing input whitespace is ignored. A terminal set in parentheses or a
 * terminal collector number may be followed by source-specific annotations.
 *
 * @throws When braces are malformed, no supported placeholder exists, or a
 * supported field appears more than once.
 */
export function compileTextCardFormat(format: string): CompiledCardFormat {
	const fields: CardFieldName[] = [];
	let pattern = "^\\s*";
	let literalStart = 0;
	let lastPlaceholderField: CardFieldName | undefined;

	for (const match of format.matchAll(placeholderPattern)) {
		const matchIndex = match.index;
		pattern += compileLiteral(format.slice(literalStart, matchIndex));
		const placeholder = match[1];
		if (!cardFieldNames.includes(placeholder as CardFieldName)) {
			pattern += formatLiteralAsPattern(match[0]);
			literalStart = matchIndex + match[0].length;
			lastPlaceholderField = undefined;
			continue;
		}
		const field = placeholder as CardFieldName;
		if (fields.includes(field)) {
			throw new Error(`Format field '${field}' may only be used once`);
		}

		fields.push(field);
		pattern += `(?<${field}>${cardFieldPattern(field)})`;
		literalStart = matchIndex + match[0].length;
		lastPlaceholderField = field;
	}

	const trailingLiteral = format.slice(literalStart);
	/** Whether a trailing collector number may be followed by source annotations. */
	const hasTerminalCollectorNumber =
		lastPlaceholderField === "collectorNumber" && trailingLiteral.trim() === "";
	/** Whether a trailing parenthesized set may precede source annotations. */
	const hasTerminalParenthesizedSet =
		lastPlaceholderField === "set" && trailingLiteral.trim() === ")";
	pattern += compileLiteral(hasTerminalCollectorNumber ? "" : trailingLiteral);
	if (fields.length === 0) {
		throw new Error(
			"Format must contain {amount}, {name}, {set}, and/or {collectorNumber}",
		);
	}

	if (hasTerminalCollectorNumber || hasTerminalParenthesizedSet) {
		pattern += "(?:\\s+.*)?";
	}
	pattern += "\\s*$";
	return { fields, pattern: new RegExp(pattern, "iu") };
}

/**
 * Parses one decklist line using a previously compiled format.
 *
 * Every field declared by the format must capture non-whitespace text. Values are
 * trimmed before return, and a mismatch is represented as `undefined` so callers
 * can attach input-specific context such as a line number.
 */
export function parseTextCardLine(
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
