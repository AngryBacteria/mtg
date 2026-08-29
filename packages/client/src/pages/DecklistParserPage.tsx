import {
	Alert,
	Button,
	FileButton,
	Group,
	Paper,
	Select,
	SimpleGrid,
	Stack,
	Table,
	Tabs,
	Text,
	Textarea,
	Title,
} from "@mantine/core";
import { useState } from "react";
import { trpc } from "../trpc.ts";
import {
	type CsvCardField,
	inferCsvColumnMapping,
	parseCsvHeader,
	textFormatPresets,
} from "../utils/decklistInput.ts";
import { logger } from "../utils/logger.ts";

/** Default placeholder layout for one card per line in the text workflow. */
const DEFAULT_TEXT_FORMAT = "{amount} {name} ({set}) {collectorNumber}";

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
	const selectedTextFormatPreset = textFormatPresets.find(
		(preset) => preset.format === textFormat,
	);

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
			inferCsvColumnMapping(nextHeaders, currentColumns),
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
							<Select
								data={textFormatPresets.map((preset) => ({
									label: `${preset.label} — ${preset.example}`,
									value: preset.format,
								}))}
								label="Format preset"
								onChange={(value) => value && setTextFormat(value)}
								placeholder="Custom format"
								value={selectedTextFormatPreset ? textFormat : null}
							/>
							<Textarea
								description="Available placeholders: {amount}, {name}, {set}, {collectorNumber}"
								label="Line format"
								onChange={(event) => setTextFormat(event.currentTarget.value)}
								value={textFormat}
							/>
							<Textarea
								autosize
								label="Decklist"
								maxRows={12}
								minRows={8}
								onChange={(event) => setTextDecklist(event.currentTarget.value)}
								placeholder={
									selectedTextFormatPreset?.example ??
									"Enter one card per line using the custom format above"
								}
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
								maxRows={12}
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
 * Users can remove matched rows from the current client-side result; summary
 * counts are derived from the remaining rows and no database records are changed.
 *
 * @param result - Matches and unmatched inputs produced by either parsing API.
 */
function CardResults({ result }: { result: CardParseResult }) {
	const [matches, setMatches] = useState(result.matches);
	const [selectedCardIds, setSelectedCardIds] = useState<
		Record<number, string>
	>({});
	const { unmatched } = result;
	const inputCardCount = matches.length + unmatched.length;
	const totalMatchedCardCount = matches.reduce(
		(total, card) => total + parseCardAmount(card.amount),
		0,
	);

	return (
		<Stack gap="md">
			<Paper p="md" radius="lg" withBorder>
				<SimpleGrid cols={{ base: 1, sm: 3 }} mb="lg" spacing="md">
					<CardCount label="Cards input" value={inputCardCount} />
					<CardCount label="Cards found" value={matches.length} />
					<CardCount label="Total cards found" value={totalMatchedCardCount} />
				</SimpleGrid>
				<Title mb="sm" order={2} size="h3">
					Matching cards
				</Title>
				{matches.length === 0 ? (
					<Text c="dimmed">No exact card matches were found.</Text>
				) : (
					<Table.ScrollContainer maxHeight="50vh" minWidth={640}>
						<Table striped highlightOnHover stickyHeader>
							<Table.Thead>
								<Table.Tr>
									<Table.Th>Amount</Table.Th>
									<Table.Th>Name</Table.Th>
									<Table.Th>Set</Table.Th>
									<Table.Th>Collector number</Table.Th>
									<Table.Th>Actions</Table.Th>
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
											<Table.Td>
												<Button
													aria-label={`Delete ${selectedCard.name} from results`}
													color="red"
													onClick={() =>
														setMatches((currentMatches) =>
															currentMatches.filter(
																(match) => match.inputIndex !== card.inputIndex,
															),
														)
													}
													size="compact-xs"
													variant="subtle"
												>
													Delete
												</Button>
											</Table.Td>
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

/** Displays one aggregate from the latest parsing and matching operation. */
function CardCount({ label, value }: { label: string; value: number }) {
	return (
		<Paper bg="var(--mantine-color-default-hover)" p="sm" radius="md">
			<Text c="dimmed" size="sm">
				{label}
			</Text>
			<Text fw={700} size="xl">
				{value}
			</Text>
		</Paper>
	);
}

/**
 * Converts optional quantity metadata into the number of physical matched cards.
 *
 * Plain integer quantities and common suffixes such as `2x` use their leading
 * integer. A missing, malformed, or negative quantity represents one card,
 * matching the natural meaning of a decklist entry without an amount column.
 */
function parseCardAmount(amount: string | undefined): number {
	if (amount === undefined || !/^\d+/u.test(amount)) return 1;
	return Number.parseInt(amount, 10);
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
