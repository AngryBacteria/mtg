import { afterEach, describe, expect, it, vi } from "vitest";

const environmentVariableNames = [
	"PORT",
	"NODE_ENV",
	"LOG_LEVEL",
	"DB_FILE_NAME",
	"DOWNLOAD_DEFAULT_CARDS_ON_STARTUP",
] as const;

const originalEnvironment = Object.fromEntries(
	environmentVariableNames.map((name) => [name, process.env[name]]),
);

/** Reloads the process utility so each test reads its newly stubbed environment. */
async function importProcessUtility() {
	vi.resetModules();
	return import("./process.js");
}

afterEach(() => {
	for (const name of environmentVariableNames) {
		const originalValue = originalEnvironment[name];
		if (originalValue === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = originalValue;
		}
	}
	vi.resetModules();
});

describe("process configuration", () => {
	it("returns default values when optional environment variables are absent", async () => {
		for (const name of environmentVariableNames) {
			delete process.env[name];
		}

		const processUtility = await importProcessUtility();

		expect(processUtility.getServerPort()).toBe(3000);
		expect(processUtility.getIsProduction()).toBe(false);
		expect(processUtility.getLogLevel()).toBeUndefined();
		expect(processUtility.getDatabaseFileName()).toBe("mtg.sqlite");
		expect(processUtility.getDownloadDefaultCardsOnStartup()).toBe(false);
	});

	it("coerces and returns configured environment values", async () => {
		process.env.PORT = "8080";
		process.env.NODE_ENV = "production";
		process.env.LOG_LEVEL = "debug";
		process.env.DB_FILE_NAME = "cards.sqlite";
		process.env.DOWNLOAD_DEFAULT_CARDS_ON_STARTUP = " true ";

		const processUtility = await importProcessUtility();

		expect(processUtility.getServerPort()).toBe(8080);
		expect(processUtility.getIsProduction()).toBe(true);
		expect(processUtility.getLogLevel()).toBe("debug");
		expect(processUtility.getDatabaseFileName()).toBe("cards.sqlite");
		expect(processUtility.getDownloadDefaultCardsOnStartup()).toBe(true);
	});

	it.each([
		["PORT", "0"],
		["PORT", "65536"],
		["NODE_ENV", "staging"],
		["LOG_LEVEL", "   "],
		["DB_FILE_NAME", ""],
		["DOWNLOAD_DEFAULT_CARDS_ON_STARTUP", "sometimes"],
	])("rejects invalid %s values", async (name, value) => {
		process.env[name] = value;

		await expect(importProcessUtility()).rejects.toThrow();
	});
});
