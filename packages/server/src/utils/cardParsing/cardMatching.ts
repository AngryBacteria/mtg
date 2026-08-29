import { eq, type SQL, sql } from "drizzle-orm";
import { cards } from "../../database/schema.js";
import type { ParsedCardFields } from "./cardTextParser.js";

/**
 * Selects the fields used to identify a card, preferring a printing's set and
 * collector number over a potentially source-specific card name.
 *
 * When both printing fields are present, all other fields—including `name` and
 * `amount`—are deliberately removed so a differing localized or decorated name
 * cannot prevent an exact printing match. Printing fields are trimmed and
 * lowercased to align with stored Scryfall set codes and case-insensitive
 * collector-number comparison. Otherwise, supplied fields are retained and only
 * the printing fields are normalized. The input object is never mutated.
 *
 * @returns A new object containing the fields that may constrain lookup.
 */
export function selectCardIdentityFields(
	parsedFields: ParsedCardFields,
): ParsedCardFields {
	if (parsedFields.set && parsedFields.collectorNumber) {
		return {
			set: parsedFields.set.trim().toLowerCase(),
			collectorNumber: parsedFields.collectorNumber.trim().toLowerCase(),
		};
	}

	const identityFields = { ...parsedFields };
	if (identityFields.set) {
		identityFields.set = identityFields.set.trim().toLowerCase();
	}
	if (identityFields.collectorNumber) {
		identityFields.collectorNumber = identityFields.collectorNumber
			.trim()
			.toLowerCase();
	}
	return identityFields;
}

/**
 * Converts parsed identity fields into Drizzle predicates for the cards table.
 *
 * Name and set use exact equality. Collector numbers use SQLite's `NOCASE`
 * collation because suffix letters may vary in case between input sources. The
 * returned list may be empty when no identity data was supplied; callers decide
 * how an unconstrained lookup should be handled.
 */
export function buildCardConditions(parsedFields: ParsedCardFields): SQL[] {
	const identityFields = selectCardIdentityFields(parsedFields);
	const conditions: SQL[] = [];
	if (identityFields.name) {
		conditions.push(eq(cards.name, identityFields.name));
	}
	if (identityFields.set) {
		conditions.push(eq(cards.set, identityFields.set));
	}
	if (identityFields.collectorNumber) {
		conditions.push(
			sql`${cards.collectorNumber} = ${identityFields.collectorNumber} collate nocase`,
		);
	}
	return conditions;
}
