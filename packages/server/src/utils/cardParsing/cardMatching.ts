import { eq, type SQL, sql } from "drizzle-orm";
import { cards } from "../../database/schema.js";
import type { ParsedCardFields } from "./cardTextParser.js";

/**
 * Selects the fields used to identify a card, preferring a printing's set and
 * collector number over a potentially source-specific card name.
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

/** Converts parsed card identity fields into exact database match conditions. */
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
