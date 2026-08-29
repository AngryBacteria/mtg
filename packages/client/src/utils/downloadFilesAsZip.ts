import { type AsyncZippable, zip } from "fflate";

/** MIME type used when exposing a generated ZIP archive to the browser. */
const ZIP_MIME_TYPE = "application/zip";

/**
 * Packages files without recompressing their data and starts one browser download.
 * Duplicate file names receive a numeric suffix so no processed image is lost.
 * Files are read in input order, then `fflate` builds the archive asynchronously.
 * This function creates a temporary object URL and clicks a temporary DOM anchor.
 *
 * @param files - Browser files to place at the archive root.
 * @param archiveName - File name offered by the browser download prompt.
 * @throws If the batch is empty, a file cannot be read, or ZIP creation fails.
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

/**
 * Wraps fflate's asynchronous ZIP callback as a promise.
 * Input buffers are consumed and stored without compression because the processed
 * PNGs are already compressed; ZIP errors reject the promise unchanged.
 */
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

/**
 * Reserves and returns a collision-free root archive name.
 * Collisions use `_2`, `_3`, and so on immediately before the final extension;
 * the supplied set is mutated so later files observe all prior reservations.
 */
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

/**
 * Initiates a browser download through a temporary DOM anchor and object URL.
 * Revocation is deferred one task so the browser can consume the clicked URL;
 * the anchor is removed synchronously after the click.
 */
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
