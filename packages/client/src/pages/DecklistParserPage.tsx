import {
	Alert,
	Button,
	FileButton,
	Group,
	Paper,
	Select,
	Stack,
	Table,
	Tabs,
	Text,
	Textarea,
	Title,
} from "@mantine/core";
import { useState } from "react";
import { trpc } from "../trpc.ts";
import { logger } from "../utils/logger.ts";

/** Default placeholder layout for one card per line in the text workflow. */
const DEFAULT_TEXT_FORMAT = "{amount} {name} ({set}) {collectorNumber}";

/** Example input demonstrating the syntax expected by the default text format. */
const TEXT_DECKLIST_EXAMPLE = "1 Sol Ring (cmm) 396\n2 Island (dmu) 278";

/**
 * Domain fields that users may associate with CSV headers.
 *
 * The selected mapping is inverted before submission because the server accepts
 * source column names as keys and normalized card fields as values.
 */
const csvCardFields = [
	{ label: "Amount", value: "amount" },
	{ label: "Card name", value: "name" },
	{ label: "Set code", value: "set" },
	{ label: "Collector number", value: "collectorNumber" },
] as const;

/** Normalized card identity or quantity field accepted by the CSV API. */
type CsvCardField = (typeof csvCardFields)[number]["value"];

/** Minimal printing identity displayed for a database match. */
type MatchedCard = {
	id: string;
	name: string;
	set: string;
	collectorNumber: string;
};
/**
 * Primary database match for an input, including selectable alternative
 * printings and the input position used to preserve submitted ordering.
 */
type MatchedCardResult = MatchedCard & {
	amount?: string;
	inputIndex: number;
	otherMatches: MatchedCard[];
};
/** Parsed input that could not be resolved to a local card printing. */
type UnmatchedCardResult = {
	inputIndex: number;
	parsedFields: Partial<
		Record<"amount" | "collectorNumber" | "name" | "set", string>
	>;
};
/** Complete result returned by either server-side decklist parsing workflow. */
type CardParseResult = {
	matches: MatchedCardResult[];
	unmatched: UnmatchedCardResult[];
};

/**
 * Coordinates the custom-text and CSV workflows for matching decklist entries
 * against the server's local card database.
 *
 * Text input is submitted with its placeholder format. CSV input is first read
 * locally so the user can map headers to normalized fields, then both the data
 * and mapping are submitted through tRPC. Starting a request clears stale
 * results and the other workflow's error; successful results retain server input
 * indexes so matches and unmatched rows can be identified in their source order.
 */
export function DecklistParserPage() {
	const [textFormat, setTextFormat] = useState(DEFAULT_TEXT_FORMAT);
	const [textDecklist, setTextDecklist] = useState("");
	const [csvDecklist, setCsvDecklist] = useState("");
	const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
	const [csvColumns, setCsvColumns] = useState<
		Partial<Record<CsvCardField, string>>
	>({});
	const [parseResult, setParseResult] = useState<CardParseResult | null>(null);

	const parseTextMutation = trpc.cards.parseText.useMutation({
		onSuccess: (result) => {
			setParseResult(result);
			logger.info(
				{
					matchedCardCount: result.matches.length,
					unmatchedCardCount: result.unmatched.length,
				},
				"parseTextDecklist: decklist matched",
			);
		},
		onError: (err) => {
			logger.warn({ err }, "parseTextDecklist: decklist parsing failed");
		},
	});
	const parseCsvMutation = trpc.cards.parseCsv.useMutation({
		onSuccess: (result) => {
			setParseResult(result);
			logger.info(
				{
					matchedCardCount: result.matches.length,
					unmatchedCardCount: result.unmatched.length,
				},
				"parseCsvDecklist: decklist matched",
			);
		},
		onError: (err) => {
			logger.warn({ err }, "parseCsvDecklist: decklist parsing failed");
		},
	});

	const activeError = parseTextMutation.error ?? parseCsvMutation.error;

	/**
	 * Starts server-side parsing and matching for the current line-based input.
	 *
	 * Existing results and CSV errors are cleared before the asynchronous mutation;
	 * validation and parse failures remain available through the mutation state.
	 */
	function parseTextDecklist(): void {
		setParseResult(null);
		parseCsvMutation.reset();
		parseTextMutation.mutate({ cards: textDecklist, format: textFormat });
	}

	/**
	 * Starts server-side parsing and matching for the current CSV input.
	 *
	 * The UI stores normalized fields keyed by their selected header. This function
	 * reverses that relationship into the server contract of CSV header to card
	 * field, omitting fields the user left unmapped, and clears stale text state.
	 */
	function parseCsvDecklist(): void {
		const columnMapping = Object.fromEntries(
			Object.entries(csvColumns)
				.filter((entry): entry is [CsvCardField, string] => Boolean(entry[1]))
				.map(([cardField, csvColumn]) => [csvColumn, cardField]),
		) as Record<string, CsvCardField>;

		setParseResult(null);
		parseTextMutation.reset();
		parseCsvMutation.mutate({ csv: csvDecklist, columnMapping });
	}

	/**
	 * Replaces the CSV input and derives the header choices used by mapping controls.
	 *
	 * Mappings to headers no longer present in the first record are discarded. Any
	 * previous result or CSV mutation error is also cleared because it describes an
	 * older version of the source data.
	 *
	 * @param csv - Complete pasted or file-loaded CSV text.
	 */
	function updateCsvDecklist(csv: string): void {
		setCsvDecklist(csv);
		const nextHeaders = parseCsvHeader(csv);
		setCsvHeaders(nextHeaders);
		setCsvColumns((currentColumns) =>
			Object.fromEntries(
				Object.entries(currentColumns).filter(([, header]) =>
					nextHeaders.includes(header),
				),
			),
		);
		setParseResult(null);
		parseCsvMutation.reset();
	}

	/**
	 * Reads a selected CSV file into the local mapping workflow.
	 *
	 * Choosing no file is a no-op. Browser read failures are logged with the file
	 * name for diagnosis; the previous input remains unchanged and the file content
	 * is never logged or uploaded until the user explicitly requests parsing.
	 *
	 * @param file - Browser-selected CSV file, or `null` when selection is cancelled.
	 */
	async function loadCsvFile(file: File | null): Promise<void> {
		if (!file) return;
		try {
			updateCsvDecklist(await file.text());
			logger.debug({ fileName: file.name }, "loadCsvFile: CSV file loaded");
		} catch (err) {
			logger.error(
				{ err, fileName: file.name },
				"loadCsvFile: CSV file failed",
			);
		}
	}

	return (
		<Stack gap="lg" maw={900} mx="auto">
			<Stack gap={4}>
				<Title order={1}>Parse a decklist</Title>
				<Text c="dimmed">
					Match cards in the local database using your own line format or mapped
					CSV columns.
				</Text>
			</Stack>

			<Paper p={{ base: "md", sm: "xl" }} radius="lg" withBorder>
				<Tabs defaultValue="text" onChange={() => setParseResult(null)}>
					<Tabs.List mb="lg">
						<Tabs.Tab value="text">Custom text</Tabs.Tab>
						<Tabs.Tab value="csv">CSV</Tabs.Tab>
					</Tabs.List>

					<Tabs.Panel value="text">
						<Stack>
							<Textarea
								description="Available placeholders: {amount}, {name}, {set}, {collectorNumber}"
								label="Line format"
								onChange={(event) => setTextFormat(event.currentTarget.value)}
								value={textFormat}
							/>
							<Textarea
								autosize
								label="Decklist"
								minRows={8}
								onChange={(event) => setTextDecklist(event.currentTarget.value)}
								placeholder={TEXT_DECKLIST_EXAMPLE}
								value={textDecklist}
							/>
							<Button
								disabled={!textDecklist.trim() || !textFormat.trim()}
								loading={parseTextMutation.isPending}
								onClick={parseTextDecklist}
							>
								Parse text decklist
							</Button>
						</Stack>
					</Tabs.Panel>

					<Tabs.Panel value="csv">
						<Stack>
							<Group>
								<FileButton accept=".csv,text/csv" onChange={loadCsvFile}>
									{(props) => <Button {...props}>Choose CSV file</Button>}
								</FileButton>
								<Text c="dimmed" size="sm">
									or paste CSV below
								</Text>
							</Group>
							<Textarea
								autosize
								label="CSV data"
								minRows={7}
								onChange={(event) =>
									updateCsvDecklist(event.currentTarget.value)
								}
								placeholder={"Card Name,Set,Number\nSol Ring,cmm,396"}
								value={csvDecklist}
							/>
							{csvHeaders.length > 0 && (
								<Stack gap="xs">
									<Text fw={500}>Map CSV columns</Text>
									{csvCardFields.map((field) => (
										<Select
											clearable
											data={csvHeaders}
											key={field.value}
											label={field.label}
											onChange={(value) =>
												setCsvColumns((columns) => ({
													...columns,
													[field.value]: value ?? undefined,
												}))
											}
											placeholder="Not mapped"
											value={csvColumns[field.value] ?? null}
										/>
									))}
								</Stack>
							)}
							<Button
								disabled={
									!csvDecklist.trim() ||
									!Object.values(csvColumns).some(Boolean)
								}
								loading={parseCsvMutation.isPending}
								onClick={parseCsvDecklist}
							>
								Parse CSV decklist
							</Button>
						</Stack>
					</Tabs.Panel>
				</Tabs>
			</Paper>

			{activeError && (
				<Alert color="red" title="Could not parse decklist">
					{activeError.message}
				</Alert>
			)}
			{parseResult && <CardResults result={parseResult} />}
		</Stack>
	);
}

/**
 * Presents matched printings and unresolved inputs from one parsing operation.
 *
 * The server's first match is displayed by default. When alternatives exist,
 * selection is tracked by original input index so two identical input lines can
 * independently choose different printings without mutating the server result.
 *
 * @param result - Matches and unmatched inputs produced by either parsing API.
 */
function CardResults({ result }: { result: CardParseResult }) {
	const [selectedCardIds, setSelectedCardIds] = useState<
		Record<number, string>
	>({});
	const { matches, unmatched } = result;

	return (
		<Stack gap="md">
			<Paper p="md" radius="lg" withBorder>
				<Title mb="sm" order={2} size="h3">
					{matches.length} matching {matches.length === 1 ? "card" : "cards"}
				</Title>
				{matches.length === 0 ? (
					<Text c="dimmed">No exact card matches were found.</Text>
				) : (
					<Table.ScrollContainer minWidth={560}>
						<Table striped highlightOnHover>
							<Table.Thead>
								<Table.Tr>
									<Table.Th>Amount</Table.Th>
									<Table.Th>Name</Table.Th>
									<Table.Th>Set</Table.Th>
									<Table.Th>Collector number</Table.Th>
								</Table.Tr>
							</Table.Thead>
							<Table.Tbody>
								{matches.map((card) => {
									const choices = [card, ...card.otherMatches];
									const selectedCard =
										choices.find(
											(choice) =>
												choice.id === selectedCardIds[card.inputIndex],
										) ?? card;

									return (
										<Table.Tr key={card.inputIndex}>
											<Table.Td>{card.amount ?? "—"}</Table.Td>
											<Table.Td>
												{choices.length === 1 ? (
													selectedCard.name
												) : (
													<Select
														aria-label={`Select match for ${card.name}`}
														data={choices.map((choice) => ({
															label: `${choice.name} (${choice.set.toUpperCase()} ${choice.collectorNumber})`,
															value: choice.id,
														}))}
														onChange={(cardId) =>
															setSelectedCardIds((currentIds) => ({
																...currentIds,
																[card.inputIndex]: cardId ?? card.id,
															}))
														}
														value={selectedCard.id}
													/>
												)}
											</Table.Td>
											<Table.Td>{selectedCard.set.toUpperCase()}</Table.Td>
											<Table.Td>{selectedCard.collectorNumber}</Table.Td>
										</Table.Tr>
									);
								})}
							</Table.Tbody>
						</Table>
					</Table.ScrollContainer>
				)}
			</Paper>
			{unmatched.length > 0 && (
				<Alert
					color="yellow"
					title={`${unmatched.length} unmatched input${unmatched.length === 1 ? "" : "s"}`}
				>
					{unmatched.map(({ inputIndex, parsedFields }) => (
						<Text key={inputIndex} size="sm">
							Input {inputIndex + 1}: {formatParsedCardFields(parsedFields)}
						</Text>
					))}
				</Alert>
			)}
		</Stack>
	);
}

/**
 * Formats the fields recovered from an unmatched input for user-facing feedback.
 *
 * Missing fields are omitted, quantities gain a multiplication marker, and set
 * codes are parenthesized to mirror the default line-based decklist format.
 *
 * @param fields - Any subset of normalized card fields recovered by the parser.
 * @returns A space-separated description; an empty object produces an empty string.
 */
function formatParsedCardFields(
	fields: UnmatchedCardResult["parsedFields"],
): string {
	return [
		fields.amount && `${fields.amount}×`,
		fields.name,
		fields.set && `(${fields.set})`,
		fields.collectorNumber,
	]
		.filter(Boolean)
		.join(" ");
}

/**
 * Extracts non-empty column names from the first RFC 4180-style CSV record.
 *
 * Quoted commas and escaped quotes are decoded, line breaks inside quoted values
 * remain part of the header, surrounding whitespace is trimmed, and a UTF-8 BOM
 * is removed from the first column. Parsing stops after the first unquoted line
 * break because later records cannot contribute mapping choices.
 *
 * This lightweight client parser exists only to populate mapping controls; the
 * server remains responsible for validating and parsing the complete document.
 *
 * @param csv - Complete or partial CSV text supplied by the user.
 * @returns Header names in source order with blank columns removed.
 */
function parseCsvHeader(csv: string): string[] {
	const header: string[] = [];
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
			header.push(value.trim());
			value = "";
		} else if ((character === "\n" || character === "\r") && !insideQuotes) {
			break;
		} else {
			value += character;
		}
	}

	if (value.length > 0 || header.length > 0) header.push(value.trim());
	return header
		.map((column, index) =>
			index === 0 ? column.replace(/^\uFEFF/u, "") : column,
		)
		.filter(Boolean);
}
