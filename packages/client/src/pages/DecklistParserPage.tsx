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

const DEFAULT_TEXT_FORMAT = "{amount} {name} ({set}) {collectorNumber}";
const TEXT_DECKLIST_EXAMPLE = "1 Sol Ring (cmm) 396\n2 Island (dmu) 278";

/** Card fields available for exact lookup from CSV columns. */
const csvCardFields = [
	{ label: "Amount", value: "amount" },
	{ label: "Card name", value: "name" },
	{ label: "Set code", value: "set" },
	{ label: "Collector number", value: "collectorNumber" },
] as const;

type CsvCardField = (typeof csvCardFields)[number]["value"];
type MatchedCard = {
	id: string;
	name: string;
	set: string;
	collectorNumber: string;
};
type MatchedCardResult = MatchedCard & {
	amount?: string;
	inputIndex: number;
	otherMatches: MatchedCard[];
};
type UnmatchedCardResult = {
	inputIndex: number;
	parsedFields: Partial<
		Record<"amount" | "collectorNumber" | "name" | "set", string>
	>;
};
type CardParseResult = {
	matches: MatchedCardResult[];
	unmatched: UnmatchedCardResult[];
};

/** Provides text-template and CSV workflows for matching a decklist to cards. */
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

	/** Sends the custom text template and decklist to the card matcher. */
	function parseTextDecklist(): void {
		setParseResult(null);
		parseCsvMutation.reset();
		parseTextMutation.mutate({ cards: textDecklist, format: textFormat });
	}

	/** Sends CSV text and its selected column mapping to the card matcher. */
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

	/** Updates CSV content and derives its header choices for field mapping. */
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

	/** Loads a selected CSV file as text without sending it elsewhere. */
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

/** Displays matched cards, quantities, alternatives, and inputs without matches. */
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

/** Formats available input fields into a concise unmatched-card description. */
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

/** Reads the first RFC 4180-style CSV row for use as mapping choices. */
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
