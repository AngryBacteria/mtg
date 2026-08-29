/** Physical card dimensions, in inches, before any printer bleed is added. */
export interface CardDimensionsInches {
	width: number;
	height: number;
}

/**
 * Describes one lossless PNG produced from a source image.
 *
 * Source dimensions refer to the decoded file before cropping; output dimensions
 * include bleed on every edge. DPI is inferred from the normalized crop and the
 * configured physical card size rather than read from image metadata.
 */
export interface PrintBleedImageResult {
	file: File;
	sourceWidth: number;
	sourceHeight: number;
	outputWidth: number;
	outputHeight: number;
	dpi: number;
	bleedPixelsPerEdge: number;
	meetsMinimumDpi: boolean;
}

/**
 * Overrides the physical card size and resolution threshold used for a batch.
 * Dimensions are inches; the DPI threshold only controls the result warning and
 * does not reject or resample low-resolution images.
 */
export interface PrintBleedOptions {
	cardDimensions?: CardDimensionsInches;
	minimumDpi?: number;
}

/** Selects either opaque black bleed or colors extended from the cropped edges. */
export type PrintBleedMode = "black" | "extend";

/**
 * Associates a source file with its per-image rendering rules.
 *
 * The inset is measured in whole source pixels from the normalized crop edge and
 * only affects extended-edge sampling; it never removes or rescales card artwork.
 */
export interface PrintBleedImageInput {
	file: File;
	mode: PrintBleedMode;
	/** Pixel distance from each outer edge used as the extended color source. */
	edgeSampleInsetPixels?: number;
}

/** Standard physical size of a poker/MTG card, excluding print bleed. */
const MTG_CARD_DIMENSIONS: CardDimensionsInches = {
	width: 2.5,
	height: 3.5,
};

/** MPC's required number of bleed pixels per edge for a 300 DPI image. */
const MPC_BLEED_PIXELS_AT_300_DPI = 36;

/** MPC's minimum recommended print resolution. */
const MPC_MINIMUM_DPI = 300;

/** Effective print resolution and its corresponding per-edge bleed, in pixels. */
interface PrintBleedMeasurements {
	dpi: number;
	bleedPixelsPerEdge: number;
}

/** Integer pixel bounds for the centered source crop matching the card ratio. */
interface CardCropRectangle {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Physical card dimensions, in inches, rotated to match source orientation. */
interface OrientedCardDimensions {
	width: number;
	height: number;
}

/** Encoded PNG and its bleed-inclusive canvas dimensions, in pixels. */
interface RenderedPrintBleedImage {
	file: File;
	width: number;
	height: number;
}

/**
 * Adds MPC-compatible edge-colored bleed to MTG card images in the browser.
 *
 * Images are center-cropped to the card's physical aspect ratio before DPI and
 * bleed are calculated. Each image can use either solid black bleed or extend
 * colors from a configurable distance inside its normalized edges. Files are
 * processed sequentially to avoid retaining several large decoded images at
 * once and are returned as lossless PNGs.
 *
 * @param images - Files or per-file settings in the order they should be processed.
 * @param options - Batch-wide physical dimensions and minimum-DPI threshold.
 * @returns Results in input order; processing stops at the first failed image.
 * @throws If configuration or per-image settings are invalid, decoding or canvas
 * rendering fails, or an entry is missing. Image failures include the file name.
 */
export async function addPrintBleedToImages(
	images: ArrayLike<File | PrintBleedImageInput>,
	options: PrintBleedOptions = {},
): Promise<PrintBleedImageResult[]> {
	const cardDimensions = options.cardDimensions ?? MTG_CARD_DIMENSIONS;
	const minimumDpi = options.minimumDpi ?? MPC_MINIMUM_DPI;

	validatePositiveDimensions(cardDimensions);
	validatePositiveNumber(minimumDpi, "minimumDpi");

	const results: PrintBleedImageResult[] = [];

	for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
		const imageInput = images[imageIndex];

		if (!imageInput) {
			throw new Error(`Image at index ${imageIndex} is missing`);
		}

		const imageFile = imageInput instanceof File ? imageInput : imageInput.file;
		const mode = imageInput instanceof File ? "extend" : imageInput.mode;
		const edgeSampleInsetPixels =
			imageInput instanceof File ? 0 : (imageInput.edgeSampleInsetPixels ?? 0);

		if (!(imageFile instanceof File)) {
			throw new TypeError(
				`Image at index ${imageIndex} must include a valid File`,
			);
		}

		try {
			validatePrintBleedMode(mode);
			validateEdgeSampleInset(edgeSampleInsetPixels);
			const result = await addPrintBleedToImage(
				imageFile,
				cardDimensions,
				minimumDpi,
				mode,
				edgeSampleInsetPixels,
			);
			results.push(result);
		} catch (error) {
			throw new Error(`Could not add print bleed to "${imageFile.name}"`, {
				cause: error,
			});
		}
	}

	return results;
}

/**
 * Decodes and renders one source file, always closing its `ImageBitmap` afterward.
 * MIME validation is advisory when a browser supplies no file type. The returned
 * DPI describes the cropped artwork, while output dimensions include bleed.
 */
async function addPrintBleedToImage(
	imageFile: File,
	cardDimensions: CardDimensionsInches,
	minimumDpi: number,
	mode: PrintBleedMode,
	edgeSampleInsetPixels: number,
): Promise<PrintBleedImageResult> {
	if (imageFile.type && !imageFile.type.startsWith("image/")) {
		throw new TypeError("The input file is not an image");
	}

	const imageBitmap = await createImageBitmap(imageFile);

	try {
		validateImageDimensions(imageBitmap.width, imageBitmap.height);
		const cardCrop = calculateCenteredCardCrop(
			imageBitmap.width,
			imageBitmap.height,
			cardDimensions,
		);
		const measurements = calculatePrintBleedMeasurements(
			cardCrop.width,
			cardCrop.height,
			cardDimensions,
		);
		const renderedImage = await renderImageWithPrintBleed(
			imageFile,
			imageBitmap,
			cardCrop,
			measurements.bleedPixelsPerEdge,
			mode,
			edgeSampleInsetPixels,
		);

		return {
			file: renderedImage.file,
			sourceWidth: imageBitmap.width,
			sourceHeight: imageBitmap.height,
			outputWidth: renderedImage.width,
			outputHeight: renderedImage.height,
			dpi: measurements.dpi,
			bleedPixelsPerEdge: measurements.bleedPixelsPerEdge,
			meetsMinimumDpi: measurements.dpi >= minimumDpi,
		};
	} finally {
		imageBitmap.close();
	}
}

/**
 * Finds the largest centered integer rectangle matching the configured card.
 * Orientation follows the source image so landscape card images remain rotated.
 * At most one axis is cropped and the other retains its complete pixel extent.
 */
function calculateCenteredCardCrop(
	pixelWidth: number,
	pixelHeight: number,
	cardDimensions: CardDimensionsInches,
): CardCropRectangle {
	const isLandscape = pixelWidth > pixelHeight;
	const orientedCardDimensions = orientCardDimensions(
		cardDimensions,
		isLandscape,
	);
	const targetAspectRatio =
		orientedCardDimensions.width / orientedCardDimensions.height;
	const sourceAspectRatio = pixelWidth / pixelHeight;

	if (sourceAspectRatio > targetAspectRatio) {
		const width = Math.max(1, Math.round(pixelHeight * targetAspectRatio));
		return {
			x: Math.floor((pixelWidth - width) / 2),
			y: 0,
			width,
			height: pixelHeight,
		};
	}

	const height = Math.max(1, Math.round(pixelWidth / targetAspectRatio));
	return {
		x: 0,
		y: Math.floor((pixelHeight - height) / 2),
		width: pixelWidth,
		height,
	};
}

/**
 * Assigns the longer physical edge to the longer image edge, regardless of
 * whether custom dimensions were supplied in portrait or landscape order.
 */
function orientCardDimensions(
	cardDimensions: CardDimensionsInches,
	isLandscape: boolean,
): OrientedCardDimensions {
	const shortEdge = Math.min(cardDimensions.width, cardDimensions.height);
	const longEdge = Math.max(cardDimensions.width, cardDimensions.height);

	return isLandscape
		? { width: longEdge, height: shortEdge }
		: { width: shortEdge, height: longEdge };
}

/** Rejects decoded images whose dimensions cannot produce a usable canvas. */
function validateImageDimensions(width: number, height: number): void {
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	) {
		throw new RangeError(
			"The decoded image must have positive, finite dimensions",
		);
	}
}

/**
 * Infers square-pixel DPI from both physical axes and uses the lower value.
 * MPC's 36-pixel bleed at 300 DPI is scaled proportionally and rounded to the
 * nearest whole pixel, preserving the intended physical bleed at other DPIs.
 */
function calculatePrintBleedMeasurements(
	pixelWidth: number,
	pixelHeight: number,
	cardDimensions: CardDimensionsInches,
): PrintBleedMeasurements {
	const isLandscape = pixelWidth > pixelHeight;
	const orientedCardDimensions = orientCardDimensions(
		cardDimensions,
		isLandscape,
	);
	const horizontalDpi = pixelWidth / orientedCardDimensions.width;
	const verticalDpi = pixelHeight / orientedCardDimensions.height;
	const dpi = Math.min(horizontalDpi, verticalDpi);
	const bleedPixelsPerEdge = Math.round(
		(dpi / MPC_MINIMUM_DPI) * MPC_BLEED_PIXELS_AT_300_DPI,
	);

	return { dpi, bleedPixelsPerEdge };
}

/**
 * Renders the normalized crop into an opaque, bleed-inclusive canvas and encodes
 * it as PNG. The output keeps the source modification timestamp but replaces its
 * extension; failures to acquire or encode a canvas are propagated to the caller.
 */
async function renderImageWithPrintBleed(
	sourceFile: File,
	imageBitmap: ImageBitmap,
	cardCrop: CardCropRectangle,
	bleedPixelsPerEdge: number,
	mode: PrintBleedMode,
	edgeSampleInsetPixels: number,
): Promise<RenderedPrintBleedImage> {
	const canvas = document.createElement("canvas");
	canvas.width = cardCrop.width + bleedPixelsPerEdge * 2;
	canvas.height = cardCrop.height + bleedPixelsPerEdge * 2;

	const context = canvas.getContext("2d", { alpha: false });

	if (!context) {
		throw new Error("The browser could not create a 2D canvas context");
	}

	context.fillStyle = "#000000";
	context.fillRect(0, 0, canvas.width, canvas.height);
	if (mode === "extend") {
		drawExtendedEdges(
			context,
			imageBitmap,
			cardCrop,
			bleedPixelsPerEdge,
			edgeSampleInsetPixels,
		);
	}
	context.drawImage(
		imageBitmap,
		cardCrop.x,
		cardCrop.y,
		cardCrop.width,
		cardCrop.height,
		bleedPixelsPerEdge,
		bleedPixelsPerEdge,
		cardCrop.width,
		cardCrop.height,
	);

	const outputBlob = await canvasToPngBlob(canvas);
	const outputName = createPrintBleedFileName(sourceFile.name);

	return {
		file: new File([outputBlob], outputName, {
			type: "image/png",
			lastModified: sourceFile.lastModified,
		}),
		width: canvas.width,
		height: canvas.height,
	};
}

/**
 * Stretches a sampled pixel row, column, and corner into the bleed area.
 * The optional inset skips unwanted pixels without scaling the card itself.
 * Insets larger than half an axis are clamped so every one-pixel sample remains
 * within the cropped source rectangle.
 */
function drawExtendedEdges(
	context: CanvasRenderingContext2D,
	imageBitmap: ImageBitmap,
	cardCrop: CardCropRectangle,
	bleedPixelsPerEdge: number,
	edgeSampleInsetPixels: number,
): void {
	if (bleedPixelsPerEdge === 0) {
		return;
	}

	const { x, y, width, height } = cardCrop;
	const bleed = bleedPixelsPerEdge;
	/** Bounds the requested buffer so every source rectangle stays inside the image. */
	const horizontalCornerInset = Math.min(
		edgeSampleInsetPixels,
		Math.floor((width - 1) / 2),
	);
	const verticalCornerInset = Math.min(
		edgeSampleInsetPixels,
		Math.floor((height - 1) / 2),
	);
	const leftCornerSample = x + horizontalCornerInset;
	const rightCornerSample = x + width - 1 - horizontalCornerInset;
	const topCornerSample = y + verticalCornerInset;
	const bottomCornerSample = y + height - 1 - verticalCornerInset;

	context.drawImage(
		imageBitmap,
		x,
		topCornerSample,
		width,
		1,
		bleed,
		0,
		width,
		bleed,
	);
	context.drawImage(
		imageBitmap,
		x,
		bottomCornerSample,
		width,
		1,
		bleed,
		bleed + height,
		width,
		bleed,
	);
	context.drawImage(
		imageBitmap,
		leftCornerSample,
		y,
		1,
		height,
		0,
		bleed,
		bleed,
		height,
	);
	context.drawImage(
		imageBitmap,
		rightCornerSample,
		y,
		1,
		height,
		bleed + width,
		bleed,
		bleed,
		height,
	);

	context.drawImage(
		imageBitmap,
		leftCornerSample,
		topCornerSample,
		1,
		1,
		0,
		0,
		bleed,
		bleed,
	);
	context.drawImage(
		imageBitmap,
		rightCornerSample,
		topCornerSample,
		1,
		1,
		bleed + width,
		0,
		bleed,
		bleed,
	);
	context.drawImage(
		imageBitmap,
		leftCornerSample,
		bottomCornerSample,
		1,
		1,
		0,
		bleed + height,
		bleed,
		bleed,
	);
	context.drawImage(
		imageBitmap,
		rightCornerSample,
		bottomCornerSample,
		1,
		1,
		bleed + width,
		bleed + height,
		bleed,
		bleed,
	);
}

/** Ensures runtime callers cannot select an unsupported rendering strategy. */
function validatePrintBleedMode(mode: PrintBleedMode): void {
	if (mode !== "black" && mode !== "extend") {
		throw new TypeError('mode must be either "black" or "extend"');
	}
}

/** Ensures an edge sample offset identifies a whole, non-negative pixel. */
function validateEdgeSampleInset(edgeSampleInsetPixels: number): void {
	if (
		!Number.isSafeInteger(edgeSampleInsetPixels) ||
		edgeSampleInsetPixels < 0
	) {
		throw new RangeError(
			"edgeSampleInsetPixels must be a non-negative integer",
		);
	}
}

/** Converts a canvas asynchronously to lossless PNG and rejects null encodings. */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error("The browser could not encode the bleed image"));
				return;
			}

			resolve(blob);
		}, "image/png");
	});
}

/**
 * Builds the processed PNG name by removing only a non-leading final extension.
 * Dotfiles and extensionless names remain intact before `_withEdge.png` is added.
 */
export function createPrintBleedFileName(sourceName: string): string {
	const extensionStart = sourceName.lastIndexOf(".");
	const baseName =
		extensionStart > 0 ? sourceName.slice(0, extensionStart) : sourceName;
	return `${baseName}_withEdge.png`;
}

/** Ensures custom physical card dimensions can safely be used in division. */
function validatePositiveDimensions(dimensions: CardDimensionsInches): void {
	validatePositiveNumber(dimensions.width, "cardDimensions.width");
	validatePositiveNumber(dimensions.height, "cardDimensions.height");
}

/** Rejects non-finite and non-positive numeric configuration values. */
function validatePositiveNumber(value: number, name: string): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive, finite number`);
	}
}
