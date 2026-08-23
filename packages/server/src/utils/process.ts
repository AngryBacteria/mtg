export const getServerPort = () =>
	Number.parseInt(process.env.PORT ?? "3000", 10);

export const getIsProduction = () => process.env.NODE_ENV === "production";

export const getLogLevel = () => process.env.LOG_LEVEL;

export const getDatabaseFileName = () =>
	process.env.DB_FILE_NAME ?? "mtg.sqlite";

export const getDownloadDefaultCardsOnStartup = () => {
	const value = process.env.DOWNLOAD_DEFAULT_CARDS_ON_STARTUP;
	if (!value) {
		return false;
	}

	const valueCleaned = value.trim().toUpperCase();
	if (valueCleaned === "1" || valueCleaned === "TRUE") {
		return true;
	}
	return false;
};
