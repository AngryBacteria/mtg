/** Physical dimensions of the card artwork before its bleed is added. */
export interface CardDimensionsInches {
	width: number;
	height: number;
}

/** Details about a processed card image and its inferred print resolution. */
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

/** Controls the physical card size used to infer DPI from pixel dimensions. */
export interface PrintBleedOptions {
	cardDimensions?: CardDimensionsInches;
	minimumDpi?: number;
}

/** Available strategies for filling the area outside the original card image. */
export type PrintBleedMode = "black" | "extend";

/** Per-image bleed settings used when cards in one batch need different treatment. */
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

/** Result of inferring an image's effective DPI and proportional bleed width. */
interface PrintBleedMeasurements {
	dpi: number;
	bleedPixelsPerEdge: number;
}

/** Integer source bounds that normalize an image to its physical card ratio. */
interface CardCropRectangle {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Card dimensions rotated to match the decoded image orientation. */
interface OrientedCardDimensions {
	width: number;
	height: number;
}

/** Encoded output and the actual canvas dimensions used to create it. */
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

/** Decodes one image, renders its bleed canvas, and releases decoded memory. */
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

/** Infers square-pixel DPI and scales MPC's 300 DPI bleed requirement. */
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

/** Renders one image with its selected bleed strategy around the original. */
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

/** Converts a canvas to a lossless PNG and reports browser encoding failures. */
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

/** Builds a clearly distinguished PNG name without retaining the source extension. */
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
