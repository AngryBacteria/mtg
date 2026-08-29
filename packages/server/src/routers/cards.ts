import { initTRPC, TRPCError } from "@trpc/server";
import { and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../database/db.js";
import { cards } from "../database/schema.js";
import {
	mapCsvRowsToCardFields,
	searchableCardFields,
} from "../utils/cardParsing/cardCsvParser.js";
import { buildCardConditions } from "../utils/cardParsing/cardMatching.js";
import {
	type CompiledCardFormat,
	compileTextCardFormat,
	type ParsedCardFields,
	parseTextCardLine,
} from "../utils/cardParsing/cardTextParser.js";
import { logger } from "../utils/logger.js";

/** tRPC factory used to declare the card mutation namespace. */
const t = initTRPC.create();

/** Validates non-empty custom decklist text and its placeholder format. */
const parseCardsInputSchema = z.object({
	cards: z.string().min(1),
	format: z.string().min(1),
});

/** Keeps API mapping destinations aligned with fields supported by the CSV parser. */
const searchableCardFieldSchema = z.enum(searchableCardFields);

/**
 * Validates CSV text and requires at least one source column mapping.
 * Header existence and record-level CSV rules are validated later by the parser
 * so those failures can include precise domain error messages.
 */
const parseCsvInputSchema = z.object({
	csv: z.string().min(1),
	columnMapping: z
		.record(z.string().min(1), searchableCardFieldSchema)
		.refine((mapping) => Object.keys(mapping).length > 0, {
			message: "At least one CSV column must be mapped",
		}),
});

/**
 * Minimal printing identity returned to the client for a database match.
 *
 * The complete Scryfall JSON remains server-side because the matching interface
 * only needs these fields to display and select primary or alternative printings.
 */
type MatchedCard = Pick<
	typeof cards.$inferSelect,
	"collectorNumber" | "id" | "name" | "set"
>;

/**
 * Successful lookup for one submitted entry.
 *
 * `inputIndex` points to the original non-blank input order. The first row sorted
 * by Scryfall ID is the deterministic primary result and all remaining candidates
 * are retained in `otherMatches`. Amount is copied from input when supplied.
 */
type CardSearchResult = MatchedCard & {
	amount?: string;
	inputIndex: number;
	otherMatches: MatchedCard[];
};

/**
 * Submitted entry with no local database match. The parsed identity is returned
 * unchanged so the client can explain or correct the failed lookup.
 */
type UnmatchedCardResult = {
	inputIndex: number;
	parsedFields: ParsedCardFields;
};

/** Shape returned by both card parsing mutations after local database lookup. */
type CardMatchingResult = {
	matches: CardSearchResult[];
	unmatched: UnmatchedCardResult[];
};

/**
 * Resolves parsed decklist entries against the local printing database.
 *
 * Lookups run concurrently, but grouping by the `Promise.all` result preserves
 * original input order. Within each group rows are sorted by Scryfall ID, making
 * primary selection deterministic; remaining rows become alternatives. Matching
 * rules come from `buildCardConditions`, including set/collector-number precedence
 * over name. This function performs database reads and does not mutate its input.
 *
 * @param parsedCards - Parsed entries in the same order as submitted non-blank input.
 * @returns Matched and unmatched groups, each ordered by original input position.
 */
async function findMatchingCards(
	parsedCards: ParsedCardFields[],
): Promise<CardMatchingResult> {
	const matchingCardGroups = await Promise.all(
		parsedCards.map((parsedFields) => {
			const conditions = buildCardConditions(parsedFields);
			return db
				.select({
					collectorNumber: cards.collectorNumber,
					id: cards.id,
					name: cards.name,
					set: cards.set,
				})
				.from(cards)
				.where(and(...conditions))
				.orderBy(cards.id);
		}),
	);

	const matches: CardSearchResult[] = [];
	const unmatched: UnmatchedCardResult[] = [];
	matchingCardGroups.forEach((matchingCards, inputIndex) => {
		const [card, ...otherMatches] = matchingCards;
		if (card) {
			matches.push({
				...card,
				...(parsedCards[inputIndex]?.amount
					? { amount: parsedCards[inputIndex].amount }
					: {}),
				inputIndex,
				otherMatches,
			});
		} else {
			unmatched.push({
				inputIndex,
				parsedFields: parsedCards[inputIndex] ?? {},
			});
		}
	});

	return { matches, unmatched };
}

/**
 * tRPC procedures for converting text or CSV decklists into local card matches.
 *
 * Both mutations validate their transport input, preserve submitted record order,
 * and return primary, alternative, and unmatched results. Format and CSV parsing
 * failures become `BAD_REQUEST` responses with source-oriented context; database
 * failures propagate as server errors. Successful operations log aggregate counts
 * only, never submitted decklist contents.
 */
export const cardsRouter = t.router({
	parseText: t.procedure
		.input(parseCardsInputSchema)
		.mutation(async ({ input }) => {
			let compiledFormat: CompiledCardFormat;
			try {
				compiledFormat = compileTextCardFormat(input.format);
			} catch (err) {
				logger.warn({ err }, "parseText: invalid card format");
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: err instanceof Error ? err.message : "Invalid card format",
					cause: err,
				});
			}

			const lines = input.cards
				.split(/\r?\n/u)
				.map((line, index) => ({ line, lineNumber: index + 1 }))
				.filter(({ line }) => line.trim().length > 0);
			const parsedLines = lines.map(({ line, lineNumber }) => {
				const parsedFields = parseTextCardLine(line, compiledFormat);
				if (parsedFields === undefined) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Card on line ${lineNumber} does not match the supplied format`,
					});
				}
				return parsedFields;
			});

			const result = await findMatchingCards(parsedLines);

			logger.info(
				{
					inputLineCount: lines.length,
					matchedCardCount: result.matches.length,
					unmatchedCardCount: result.unmatched.length,
				},
				"parseText: cards parsed",
			);
			return result;
		}),
	parseCsv: t.procedure
		.input(parseCsvInputSchema)
		.mutation(async ({ input }) => {
			let parsedRows: ParsedCardFields[];
			try {
				parsedRows = mapCsvRowsToCardFields(input.csv, input.columnMapping);
			} catch (err) {
				logger.warn({ err }, "parseCsv: invalid CSV input");
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: err instanceof Error ? err.message : "Invalid CSV input",
					cause: err,
				});
			}

			const result = await findMatchingCards(parsedRows);
			logger.info(
				{
					inputRowCount: parsedRows.length,
					matchedCardCount: result.matches.length,
					unmatchedCardCount: result.unmatched.length,
				},
				"parseCsv: cards parsed",
			);
			return result;
		}),
});
