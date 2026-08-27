import { type AsyncZippable, zip } from "fflate";

/** MIME type used when exposing a generated ZIP archive to the browser. */
const ZIP_MIME_TYPE = "application/zip";

/**
 * Packages files without recompressing their data and starts one browser download.
 * Duplicate file names receive a numeric suffix so no processed image is lost.
 */
export async function downloadFilesAsZip(
	files: readonly File[],
	archiveName: string,
): Promise<void> {
	if (files.length === 0) {
		throw new Error("At least one file is required to create a ZIP archive");
	}

	const archiveEntries: AsyncZippable = {};
	const usedFileNames = new Set<string>();

	for (const file of files) {
		const uniqueFileName = createUniqueFileName(file.name, usedFileNames);
		const fileBytes = new Uint8Array(await file.arrayBuffer());
		archiveEntries[uniqueFileName] = [fileBytes, { level: 0 }];
	}

	const archiveBytes = await createZipArchive(archiveEntries);
	const archiveBlob = new Blob([new Uint8Array(archiveBytes)], {
		type: ZIP_MIME_TYPE,
	});

	downloadBlob(archiveBlob, archiveName);
}

/** Builds the ZIP away from the main browser thread for responsive large batches. */
function createZipArchive(archiveEntries: AsyncZippable): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		zip(archiveEntries, { consume: true, level: 0 }, (err, archiveBytes) => {
			if (err) {
				reject(err);
				return;
			}

			resolve(archiveBytes);
		});
	});
}

/** Returns a collision-free archive path while preserving the file extension. */
function createUniqueFileName(
	requestedName: string,
	usedFileNames: Set<string>,
): string {
	if (!usedFileNames.has(requestedName)) {
		usedFileNames.add(requestedName);
		return requestedName;
	}

	const extensionStart = requestedName.lastIndexOf(".");
	const hasExtension = extensionStart > 0;
	const baseName = hasExtension
		? requestedName.slice(0, extensionStart)
		: requestedName;
	const extension = hasExtension ? requestedName.slice(extensionStart) : "";
	let duplicateNumber = 2;
	let candidateName = `${baseName}_${duplicateNumber}${extension}`;

	while (usedFileNames.has(candidateName)) {
		duplicateNumber += 1;
		candidateName = `${baseName}_${duplicateNumber}${extension}`;
	}

	usedFileNames.add(candidateName);
	return candidateName;
}

/** Creates a temporary object URL and uses it for a browser download. */
function downloadBlob(blob: Blob, fileName: string): void {
	const objectUrl = URL.createObjectURL(blob);
	const downloadLink = document.createElement("a");

	downloadLink.href = objectUrl;
	downloadLink.download = fileName;
	document.body.append(downloadLink);
	downloadLink.click();
	downloadLink.remove();
	setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
