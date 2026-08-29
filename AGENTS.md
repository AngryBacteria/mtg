# Repository Guide

## Project overview

This repository is a pnpm monorepo for browser-based Magic: The Gathering tools. It requires Node.js 24 or newer and pnpm 11 or newer.

- `packages/client` is a React 19 and Vite application using Mantine, TanStack Router, TanStack Query, and tRPC React Query.
- `packages/server` is a Fastify and tRPC service backed by SQLite through Drizzle ORM.
- `mockData/scryfallCard.json` contains representative Scryfall data for development and tests.
- `biome.json` is the shared formatter and linter configuration. The codebase uses tabs and Biome-organized imports.

## Important features and code locations

### Application shell and routing

- `packages/client/src/main.tsx` creates the React root and configures Mantine, TanStack Query, TanStack Router, and the tRPC client. Browser tRPC requests are sent to `/trpc`.
- `packages/client/src/router.tsx` declares the client routes. `/images` opens the image formatter, `/decklist` opens the decklist parser, and `/` redirects to `/images`.
- `packages/client/src/App.tsx` owns the shared navigation and page layout.

### Print-bleed image formatting

- `packages/client/src/components/PrintBleedUploader.tsx` owns file selection, per-image settings, previews, progress and error feedback, and ZIP download orchestration.
- `packages/client/src/utils/addPrintBleed.ts` contains the image-processing rules. It center-crops images to the configured physical card ratio, infers DPI, calculates MakePlayingCards-compatible bleed, renders either black or extended-edge bleed, and encodes lossless PNG output. It deliberately processes images sequentially and closes each `ImageBitmap` to limit browser memory usage.
- `packages/client/src/utils/downloadFilesAsZip.ts` packages processed files with `fflate`, preserves files with duplicate names by adding suffixes, and initiates the browser download.
- `packages/client/src/utils/addPrintBleed.test.ts` specifies cropping, orientation, DPI, edge sampling, canvas failures, file naming, and bitmap cleanup.

Keep image manipulation in the browser unless the feature explicitly requires server-side processing. Preserve cleanup of object URLs, decoded bitmaps, and other browser resources when changing this workflow.

### Decklist parsing and card matching

- `packages/client/src/pages/DecklistParserPage.tsx` provides the custom-text and CSV interfaces, maps CSV headers to card fields, invokes tRPC mutations, and displays primary, alternative, and unmatched results.
- `packages/server/src/routers/cards.ts` validates both API inputs, coordinates parsing and database lookup, preserves input order through `inputIndex`, selects a primary match, and returns remaining candidates as `otherMatches`.
- `packages/server/src/utils/cardParsing/cardTextParser.ts` compiles placeholder formats such as `{amount} {name} ({set}) {collectorNumber}` into reusable regular expressions and parses individual lines.
- `packages/server/src/utils/cardParsing/cardCsvParser.ts` parses RFC 4180-style CSV, including quoted commas, escaped quotes, multiline values, CRLF input, and a possible UTF-8 BOM on the first header.
- `packages/server/src/utils/cardParsing/cardMatching.ts` translates parsed identity fields into Drizzle conditions. A complete `set` plus `collectorNumber` identifies a printing and intentionally takes precedence over `name`.
- Tests beside these modules define parsing edge cases and matching precedence. Update them when changing accepted formats or identity behavior.

### Card data and server runtime

- `packages/server/src/scripts/downloadScryfallCards.ts` discovers Scryfall's default-card bulk file, streams and gunzips its JSONL records, validates required card fields, and inserts cards in batches of 100 without replacing existing IDs.
- `packages/server/src/database/schema.ts` defines the `cards` SQLite table. Searchable fields are generated from the stored complete Scryfall JSON, and indexes support name and set/collector-number lookups.
- `packages/server/src/database/db.ts` opens the configured SQLite database synchronously and exposes the Drizzle client.
- `packages/server/src/routers/router.ts` is the root tRPC router and exports `AppRouter`, which provides end-to-end types to the client.
- `packages/server/src/utils/fastifyServer.ts` constructs the Fastify server, mounts tRPC at `/trpc`, and owns request lifecycle logging.
- `packages/server/src/index.ts` starts the server and optionally launches the Scryfall import in the background.
- `packages/server/src/utils/process.ts` validates environment variables at module load. Supported values are `PORT`, `NODE_ENV`, `LOG_LEVEL`, `DB_FILE_NAME`, and `DOWNLOAD_DEFAULT_CARDS_ON_STARTUP`.
- `packages/server/drizzle.config.ts` points Drizzle Kit at the schema and configured SQLite file.

The Scryfall import performs network and database writes. Do not run it as an incidental verification step. Make database schema changes in `schema.ts` and validate them with the Drizzle workflow rather than hand-editing a SQLite file.

## Commands

Run commands from the repository root unless a package-specific command is clearer.

- `pnpm dev` starts all package development processes in parallel.
- `pnpm build` builds every package.
- `pnpm typecheck` type-checks every package.
- `pnpm check` runs the shared Biome checks; `pnpm check:fix` applies formatting and lint fixes.
- `pnpm --filter @mtg/client test` runs client tests.
- `pnpm --filter @mtg/server test` runs server tests.
- `pnpm --filter @mtg/server db:update` pushes the Drizzle schema to the configured database.
- `pnpm --filter @mtg/server db:open` opens Drizzle Studio.

For focused work, run the closest relevant test file first, then the package tests, typecheck, and Biome checks in proportion to the change.

# Coding Guidelines

## Documentation and JSDoc

Write JSDoc that explains the code's contract and reasoning, not just its name. A reader should be able to understand why a symbol exists, how it behaves, and what matters when changing or calling it without first reading its entire implementation.

- Add JSDoc to every exported function, class, type, interface, and non-obvious exported variable.
- Add JSDoc to non-exported functions, types, constants, and variables whenever they contain business rules, coordinate multiple operations, manage resources, normalize or validate data, or have behavior that is not immediately obvious.
- Trivial callbacks, direct event setters, simple local aliases, and self-evident constants do not need documentation.
- Start with a concise summary, then add details when the contract has important sequencing, precedence, fallback, normalization, mutation, performance, or cleanup behavior.
- Describe meaningful inputs and outputs in prose. Use `@param` and `@returns` when they add information that is not clear from TypeScript types, especially units, accepted formats, normalization, ordering, or ownership. Do not add tags that merely repeat parameter names and types.
- Document thrown errors with `@throws` when callers are expected to handle them or when failure conditions form part of the API contract.
- State side effects explicitly: network requests, database writes, downloads, logging, DOM or canvas operations, object URL creation, resource disposal, and mutation of passed collections.
- Explain invariants and domain decisions near the code that enforces them. Examples include preferring `set` plus `collectorNumber` over card name, processing images sequentially to limit memory, and scaling bleed from inferred DPI.
- For React components and hooks, describe the user workflow or state they coordinate. Do not narrate JSX or list obvious state variables.
- For types and interfaces, explain what the model represents and semantic relationships among fields, such as whether dimensions are before or after cropping or whether an index refers to the original input.
- Keep comments accurate when behavior changes. Delete stale comments rather than leaving documentation that describes an earlier implementation.
- Avoid comments that paraphrase syntax, such as “increments the counter,” “returns the result,” or “user ID variable.”

Prefer documentation like this:

```ts
/**
 * Resolves parsed decklist entries against the local print database.
 *
 * Results retain their original input index. The first database row is the
 * primary match and any additional printings are exposed as alternatives;
 * entries with no match are returned separately with their parsed fields.
 *
 * @param parsedCards - Card fields in the same order as the submitted input.
 * @returns Primary matches and unmatched inputs without reordering either set.
 */
async function findMatchingCards(parsedCards: ParsedCardFields[]) { /* ... */ }
```

Avoid documentation like this:

```ts
/** Finds matching cards. */
async function findMatchingCards(parsedCards: ParsedCardFields[]) { /* ... */ }
```

## Implementation style

- Prioritize readability and developer experience over reducing line count or writing overly compact code.
- Prefer descriptive names, explicit intermediate values, and straightforward control flow over clever abstractions.
- Keep browser-only APIs in the client and Node-only APIs in the server.
- Preserve the end-to-end API type boundary: server procedures belong under the root `AppRouter`, and the client should consume their inferred tRPC types where practical.
- Validate data at external boundaries with Zod or explicit guards. Include enough context in user-facing errors to identify the bad line, row, file, or setting without exposing sensitive data.
- Keep tests next to the implementation as `*.test.ts`. Test observable behavior and important edge cases, particularly parsing rules, normalization, async cleanup, and partial failures.

## Logging

- Add enough logs to make application behavior and failures easy to understand, without logging routine internal details excessively.
- Use the appropriate Pino level: `debug` for diagnostic details, `info` for meaningful lifecycle events or completed user operations, `warn` for recoverable or rejected input, and `error` for failed operations that need attention.
- Begin every log message with the owning function name in the format `functionName: log message`.
- Keep message text stable so logs remain easy to search and aggregate.
- Put important or structured data in the Pino object, not inside the message string: `logger.info({ userId }, "loadUser: user loaded")`.
- Pass errors under the `err` key: `logger.error({ err }, "loadUser: operation failed")`.
- Never log secrets, credentials, tokens, passwords, full card-list contents, image contents, or unnecessary personal data. File names may be logged only when they are useful diagnostic context.
- Avoid duplicate error logs. Log an error where it is handled or where useful context is added; do not log and rethrow at every layer.
