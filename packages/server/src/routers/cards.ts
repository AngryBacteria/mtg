import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../database/db.js";
import { cards } from "../database/schema.js";
import {
	type CompiledCardFormat,
	compileCardFormat,
	type ParsedCardFields,
	parseCardLine,
} from "../utils/cardFormat.js";
import { logger } from "../utils/logger.js";

const t = initTRPC.create();

const parseCardsInputSchema = z.object({
	cards: z.string().min(1),
	format: z.string().min(1),
});

/** Converts the available parsed fields into exact database match conditions. */
function buildCardConditions(parsedFields: ParsedCardFields): SQL[] {
	const conditions: SQL[] = [];
	if (parsedFields.name !== undefined) {
		conditions.push(eq(cards.name, parsedFields.name));
	}
	if (parsedFields.set !== undefined) {
		conditions.push(eq(cards.set, parsedFields.set.toLowerCase()));
	}
	if (parsedFields.collectorNumber !== undefined) {
		conditions.push(eq(cards.collectorNumber, parsedFields.collectorNumber));
	}
	return conditions;
}

/** Exposes the API procedure that parses card lines and returns database matches. */
export const cardsRouter = t.router({
	parse: t.procedure
		.input(parseCardsInputSchema)
		.mutation(async ({ input }) => {
			let compiledFormat: CompiledCardFormat;
			try {
				compiledFormat = compileCardFormat(input.format);
			} catch (err) {
				logger.warn({ err }, "parseCards: invalid card format");
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
				const parsedFields = parseCardLine(line, compiledFormat);
				if (parsedFields === undefined) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Card on line ${lineNumber} does not match the supplied format`,
					});
				}
				return parsedFields;
			});

			const matchingCards = await Promise.all(
				parsedLines.map((parsedFields) => {
					const conditions = buildCardConditions(parsedFields);
					return db
						.select()
						.from(cards)
						.where(and(...conditions));
				}),
			);
			const result = matchingCards.flat();

			logger.info(
				{ inputLineCount: lines.length, matchedCardCount: result.length },
				"parseCards: cards parsed",
			);
			return result;
		}),
});
