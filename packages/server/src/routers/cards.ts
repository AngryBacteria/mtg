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

const t = initTRPC.create();

const parseCardsInputSchema = z.object({
	cards: z.string().min(1),
	format: z.string().min(1),
});

/** Validates database card fields supported by CSV column mappings. */
const searchableCardFieldSchema = z.enum(searchableCardFields);

/** Validates CSV text and its source-column-to-database-field mapping. */
const parseCsvInputSchema = z.object({
	csv: z.string().min(1),
	columnMapping: z
		.record(z.string().min(1), searchableCardFieldSchema)
		.refine((mapping) => Object.keys(mapping).length > 0, {
			message: "At least one CSV column must be mapped",
		}),
});

/** A primary card match accompanied by the remaining matches for the same input. */
type CardSearchResult = typeof cards.$inferSelect & {
	amount?: string;
	inputIndex: number;
	otherMatches: (typeof cards.$inferSelect)[];
};

/** Describes an input that did not match any card in the local database. */
type UnmatchedCardResult = {
	inputIndex: number;
	parsedFields: ParsedCardFields;
};

/** Returns matched cards and preserves every input that had no database match. */
async function findMatchingCards(parsedCards: ParsedCardFields[]) {
	const matchingCardGroups = await Promise.all(
		parsedCards.map((parsedFields) => {
			const conditions = buildCardConditions(parsedFields);
			return db
				.select()
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

/** Exposes text and CSV parsing procedures that return matching database cards. */
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
