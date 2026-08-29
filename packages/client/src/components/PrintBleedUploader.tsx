import {
	Alert,
	Badge,
	Button,
	FileButton,
	Group,
	Image,
	Modal,
	NativeSelect,
	NumberInput,
	Paper,
	ScrollArea,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import {
	addPrintBleedToImages,
	createPrintBleedFileName,
	type PrintBleedMode,
} from "../utils/addPrintBleed.ts";
import { downloadFilesAsZip } from "../utils/downloadFilesAsZip.ts";
import { logger } from "../utils/logger.ts";

/** Name of the single archive downloaded after a successful batch. */
const OUTPUT_ARCHIVE_NAME = "mtg-images-with-edge.zip";

/** Monotonic identity source for files that may otherwise share all metadata. */
let nextSelectedImageId = 0;

/** Counts completed outputs and those below the configured print-DPI threshold. */
interface ProcessingSummary {
	processedImageCount: number;
	lowDpiImageCount: number;
}

/** Pixel dimensions used to label and proportion comparison previews. */
interface ImagePixelDimensions {
	width: number;
	height: number;
}

/**
 * Holds a selected browser file, stable UI identity, and editable render settings.
 * The sampling inset is a whole-pixel offset used only by extended-edge mode.
 */
interface SelectedImage {
	id: string;
	file: File;
	bleedMode: PrintBleedMode;
	edgeSampleInsetPixels: number;
}

/**
 * State for an original-versus-processed preview.
 * URLs are component-owned object URLs and must be revoked when replaced, closed,
 * or unmounted; dimensions are populated after asynchronous processing completes.
 */
interface ImagePreview {
	fileName: string;
	sourceUrl: string;
	bleedUrl: string | null;
	bleedMode: PrintBleedMode;
	bleedPixelsPerEdge: number | null;
	sourceDimensions: ImagePixelDimensions | null;
	outputDimensions: ImagePixelDimensions | null;
	errorMessage: string | null;
}

/**
 * Coordinates the complete browser-only print-bleed workflow.
 *
 * Users can append image batches, choose black or extended-edge bleed per file,
 * inspect an asynchronously rendered comparison, and download all outputs as one
 * ZIP. Stale preview completions are ignored through request identities, temporary
 * object URLs are revoked, and batch failures remain visible without clearing the
 * user's selections or settings.
 */
export function PrintBleedUploader() {
	const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [processingSummary, setProcessingSummary] =
		useState<ProcessingSummary | null>(null);
	const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
	const [isPreviewProcessing, setIsPreviewProcessing] = useState(false);
	const resetFileInputRef = useRef<() => void>(null);
	const previewRequestIdRef = useRef(0);
	const previewUrlsRef = useRef(new Set<string>());

	useEffect(() => {
		return () => {
			for (const previewUrl of previewUrlsRef.current) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, []);

	/** Revokes and forgets every component-owned URL for the active preview. */
	function revokePreviewUrls(): void {
		for (const previewUrl of previewUrlsRef.current) {
			URL.revokeObjectURL(previewUrl);
		}
		previewUrlsRef.current.clear();
	}

	/**
	 * Appends MIME-typed images with stable identities and default black bleed.
	 * Non-images are omitted as a group and reported to the user; resetting the
	 * picker permits selecting the same browser file again later.
	 */
	function handleImagesSelected(files: File[]): void {
		const validImages = files.filter((file) => file.type.startsWith("image/"));
		const newSelectedImages = validImages.map((file) => {
			nextSelectedImageId += 1;
			return {
				id: `selected-image-${nextSelectedImageId}`,
				file,
				bleedMode: "black" as const,
				edgeSampleInsetPixels: 0,
			};
		});
		const ignoredFileCount = files.length - validImages.length;

		setSelectedImages((currentImages) => [
			...currentImages,
			...newSelectedImages,
		]);
		setProcessingSummary(null);
		setErrorMessage(
			ignoredFileCount > 0
				? `${ignoredFileCount} non-image ${ignoredFileCount === 1 ? "file was" : "files were"} ignored.`
				: null,
		);
		resetFileInputRef.current?.();

		logger.debug(
			{ addedImageCount: validImages.length, ignoredFileCount },
			"handleImagesSelected: image selection updated",
		);
	}

	/** Changes whether one image receives solid black or extended-edge bleed. */
	function handleBleedModeChanged(
		imageId: string,
		bleedMode: PrintBleedMode,
	): void {
		setSelectedImages((currentImages) =>
			currentImages.map((image) =>
				image.id === imageId ? { ...image, bleedMode } : image,
			),
		);
		setProcessingSummary(null);
	}

	/**
	 * Stores a whole-pixel edge sampling inset for one image.
	 * Mantine may emit an empty string while editing, which is normalized to zero.
	 */
	function handleEdgeSampleInsetChanged(
		imageId: string,
		edgeSampleInsetPixels: string | number,
	): void {
		const normalizedInset =
			typeof edgeSampleInsetPixels === "number" ? edgeSampleInsetPixels : 0;
		setSelectedImages((currentImages) =>
			currentImages.map((image) =>
				image.id === imageId
					? { ...image, edgeSampleInsetPixels: normalizedInset }
					: image,
			),
		);
		setProcessingSummary(null);
	}

	/** Removes one selected image by its stable identifier. */
	function handleRemoveImage(imageId: string): void {
		setSelectedImages((currentImages) =>
			currentImages.filter((image) => image.id !== imageId),
		);
		setProcessingSummary(null);
		setErrorMessage(null);
	}

	/**
	 * Opens an original-versus-processed preview using current per-image settings.
	 * Each request supersedes earlier work: late results are discarded and their
	 * object URLs revoked. Rendering errors are shown in the modal and logged once.
	 */
	async function handlePreviewImage(image: SelectedImage): Promise<void> {
		previewRequestIdRef.current += 1;
		const requestId = previewRequestIdRef.current;
		revokePreviewUrls();
		const sourceUrl = URL.createObjectURL(image.file);
		previewUrlsRef.current.add(sourceUrl);

		setImagePreview({
			fileName: image.file.name,
			sourceUrl,
			bleedUrl: null,
			bleedMode: image.bleedMode,
			bleedPixelsPerEdge: null,
			sourceDimensions: null,
			outputDimensions: null,
			errorMessage: null,
		});
		setIsPreviewProcessing(true);

		logger.debug(
			{ fileName: image.file.name, bleedMode: image.bleedMode },
			"handlePreviewImage: image preview opened",
		);

		try {
			const [processedImage] = await addPrintBleedToImages([
				{
					file: image.file,
					mode: image.bleedMode,
					edgeSampleInsetPixels: image.edgeSampleInsetPixels,
				},
			]);

			if (!processedImage) {
				throw new Error("The bleed preview did not produce an image.");
			}

			const bleedUrl = URL.createObjectURL(processedImage.file);
			if (previewRequestIdRef.current !== requestId) {
				URL.revokeObjectURL(bleedUrl);
				return;
			}
			previewUrlsRef.current.add(bleedUrl);

			setImagePreview((currentPreview) =>
				currentPreview
					? {
							...currentPreview,
							bleedUrl,
							bleedPixelsPerEdge: processedImage.bleedPixelsPerEdge,
							sourceDimensions: {
								width: processedImage.sourceWidth,
								height: processedImage.sourceHeight,
							},
							outputDimensions: {
								width: processedImage.outputWidth,
								height: processedImage.outputHeight,
							},
						}
					: null,
			);
		} catch (err) {
			if (previewRequestIdRef.current !== requestId) {
				return;
			}

			setImagePreview((currentPreview) =>
				currentPreview
					? { ...currentPreview, errorMessage: getErrorMessage(err) }
					: null,
			);
			logger.error(
				{ err, fileName: image.file.name },
				"handlePreviewImage: bleed preview failed",
			);
		} finally {
			if (previewRequestIdRef.current === requestId) {
				setIsPreviewProcessing(false);
			}
		}
	}

	/** Closes the preview, invalidates pending work, and revokes owned object URLs. */
	function handleClosePreview(): void {
		previewRequestIdRef.current += 1;
		setImagePreview(null);
		setIsPreviewProcessing(false);
		revokePreviewUrls();
	}

	/** Clears all selected images and feedback from the previous batch. */
	function handleClearImages(): void {
		setSelectedImages([]);
		setProcessingSummary(null);
		setErrorMessage(null);
		resetFileInputRef.current?.();
	}

	/**
	 * Sequentially renders the selected batch, then starts one ZIP download.
	 * A summary counts low-DPI results without rejecting them. Any render, encoding,
	 * ZIP, or browser-file failure aborts the workflow and becomes user feedback;
	 * processing state is cleared in all cases.
	 */
	async function handleProcessImages(): Promise<void> {
		if (selectedImages.length === 0) {
			return;
		}

		setIsProcessing(true);
		setErrorMessage(null);
		setProcessingSummary(null);

		logger.info(
			{ imageCount: selectedImages.length },
			"handleProcessImages: print bleed batch started",
		);

		try {
			const processedImages = await addPrintBleedToImages(
				selectedImages.map((image) => ({
					file: image.file,
					mode: image.bleedMode,
					edgeSampleInsetPixels: image.edgeSampleInsetPixels,
				})),
			);
			await downloadFilesAsZip(
				processedImages.map((result) => result.file),
				OUTPUT_ARCHIVE_NAME,
			);

			const lowDpiImageCount = processedImages.filter(
				(result) => !result.meetsMinimumDpi,
			).length;
			setProcessingSummary({
				processedImageCount: processedImages.length,
				lowDpiImageCount,
			});

			logger.info(
				{
					imageCount: processedImages.length,
					lowDpiImageCount,
				},
				"handleProcessImages: print bleed batch downloaded",
			);
		} catch (err) {
			setErrorMessage(getErrorMessage(err));
			logger.error(
				{ err, imageCount: selectedImages.length },
				"handleProcessImages: print bleed batch failed",
			);
		} finally {
			setIsProcessing(false);
		}
	}

	return (
		<>
			<Modal
				centered
				onClose={handleClosePreview}
				opened={imagePreview !== null}
				size="xl"
				title={imagePreview?.fileName ?? "Image preview"}
			>
				{imagePreview && (
					<Stack>
						<Group align="flex-start" grow>
							<Stack gap="xs">
								<Text fw={500} ta="center">
									Original
								</Text>
								<Image
									alt={`Original ${imagePreview.fileName}`}
									mx="auto"
									src={imagePreview.sourceUrl}
									style={{ height: "auto" }}
									w={calculateComparisonImageWidth(
										imagePreview.sourceDimensions,
										imagePreview.outputDimensions,
									)}
								/>
								{imagePreview.sourceDimensions && (
									<Text c="dimmed" size="sm" ta="center">
										{formatImageDimensions(imagePreview.sourceDimensions)}
									</Text>
								)}
							</Stack>
							<Stack gap="xs">
								<Text fw={500} ta="center">
									With{" "}
									{imagePreview.bleedMode === "black" ? "black" : "extended"}{" "}
									bleed
								</Text>
								{imagePreview.bleedUrl && (
									<>
										<Image
											alt={`${imagePreview.bleedMode === "black" ? "Black" : "Extended"} bleed preview of ${imagePreview.fileName}`}
											mx="auto"
											src={imagePreview.bleedUrl}
											style={{ height: "auto" }}
											w={calculateComparisonImageWidth(
												imagePreview.outputDimensions,
												imagePreview.sourceDimensions,
											)}
										/>
										{imagePreview.outputDimensions && (
											<Text c="dimmed" size="sm" ta="center">
												{formatImageDimensions(imagePreview.outputDimensions)}
											</Text>
										)}
									</>
								)}
								{isPreviewProcessing && (
									<Text c="dimmed" ta="center">
										Generating bleed preview…
									</Text>
								)}
							</Stack>
						</Group>
						{imagePreview.bleedPixelsPerEdge !== null && (
							<Text c="dimmed" size="sm" ta="center">
								The processed image adds {imagePreview.bleedPixelsPerEdge}{" "}
								pixels to every edge.
							</Text>
						)}
						{imagePreview.errorMessage && (
							<Alert color="red" title="Could not generate bleed preview">
								{imagePreview.errorMessage}
							</Alert>
						)}
					</Stack>
				)}
			</Modal>
			<Paper
				maw={760}
				mx="auto"
				p={{ base: "md", sm: "xl" }}
				radius="lg"
				withBorder
			>
				<Stack gap="lg">
					<Stack gap={4}>
						<Title order={1}>Add print bleed</Title>
						<Text c="dimmed">
							Choose one or many card images, then select solid black bleed for
							bordered cards or extended edges for full-art cards. Images that
							do not match the card aspect ratio are center-cropped before bleed
							is added.
						</Text>
					</Stack>

					<Group>
						<FileButton
							accept="image/*"
							disabled={isProcessing}
							multiple
							onChange={handleImagesSelected}
							resetRef={resetFileInputRef}
						>
							{(fileButtonProps) => (
								<Button {...fileButtonProps} variant="light">
									Choose images
								</Button>
							)}
						</FileButton>
						{selectedImages.length > 0 && (
							<Button
								disabled={isProcessing}
								onClick={handleClearImages}
								variant="subtle"
							>
								Clear all
							</Button>
						)}
						<Badge
							color={selectedImages.length > 0 ? "blue" : "gray"}
							size="lg"
						>
							{selectedImages.length} selected
						</Badge>
					</Group>

					{selectedImages.length > 0 && (
						<ScrollArea.Autosize mah={320} offsetScrollbars type="auto">
							<Stack gap="xs">
								{selectedImages.map(
									({ id, file, bleedMode, edgeSampleInsetPixels }) => (
										<Paper key={id} p="sm" withBorder>
											<Stack gap="sm">
												<Group justify="space-between" wrap="nowrap">
													<Stack gap={1} style={{ minWidth: 0 }}>
														<Text fw={500} truncate>
															{file.name} · ({formatFileSize(file.size)})
														</Text>
														<Text c="dimmed" size="xs" truncate>
															→ {createPrintBleedFileName(file.name)}
														</Text>
													</Stack>
													<Group gap="xs" wrap="nowrap">
														<Button
															aria-label={`Preview ${file.name}`}
															onClick={() =>
																handlePreviewImage({
																	id,
																	file,
																	bleedMode,
																	edgeSampleInsetPixels,
																})
															}
															size="compact-xs"
															variant="light"
														>
															Preview
														</Button>
														<Button
															aria-label={`Remove ${file.name}`}
															disabled={isProcessing}
															onClick={() => handleRemoveImage(id)}
															size="compact-xs"
															variant="subtle"
														>
															Remove
														</Button>
													</Group>
												</Group>
												<Group align="end" grow>
													<NativeSelect
														disabled={isProcessing}
														label="Bleed style"
														onChange={(event) =>
															handleBleedModeChanged(
																id,
																event.currentTarget.value as PrintBleedMode,
															)
														}
														value={bleedMode}
													>
														<option value="black">
															Solid black (bordered card)
														</option>
														<option value="extend">
															Extend edges (full art)
														</option>
													</NativeSelect>
													{bleedMode === "extend" && (
														<NumberInput
															allowDecimal={false}
															allowNegative={false}
															disabled={isProcessing}
															label="Ignore outer pixels"
															min={0}
															onChange={(value) =>
																handleEdgeSampleInsetChanged(id, value)
															}
															suffix=" px"
															value={edgeSampleInsetPixels}
														/>
													)}
												</Group>
											</Stack>
										</Paper>
									),
								)}
							</Stack>
						</ScrollArea.Autosize>
					)}

					{errorMessage && (
						<Alert color="red" title="Could not add or process images">
							{errorMessage}
						</Alert>
					)}

					{processingSummary && (
						<Alert
							color={
								processingSummary.lowDpiImageCount > 0 ? "yellow" : "green"
							}
						>
							Downloaded {processingSummary.processedImageCount} processed{" "}
							{processingSummary.processedImageCount === 1 ? "image" : "images"}{" "}
							in {OUTPUT_ARCHIVE_NAME}.
							{processingSummary.lowDpiImageCount > 0 && (
								<>
									{" "}
									{processingSummary.lowDpiImageCount} did not meet the
									recommended 300 DPI.
								</>
							)}
						</Alert>
					)}

					<Button
						disabled={selectedImages.length === 0}
						loading={isProcessing}
						onClick={handleProcessImages}
						size="md"
					>
						Add edge and download ZIP
					</Button>
				</Stack>
			</Paper>
		</>
	);
}

/** Formats byte counts using binary thresholds and one decimal place above bytes. */
function formatFileSize(byteCount: number): string {
	if (byteCount < 1024) {
		return `${byteCount} B`;
	}

	if (byteCount < 1024 * 1024) {
		return `${(byteCount / 1024).toFixed(1)} KB`;
	}

	return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats pixel dimensions with exact reduced and four-decimal aspect ratios.
 * Inputs are expected to be positive integer browser image dimensions.
 */
function formatImageDimensions(dimensions: ImagePixelDimensions): string {
	const commonDivisor = greatestCommonDivisor(
		dimensions.width,
		dimensions.height,
	);
	const reducedWidth = dimensions.width / commonDivisor;
	const reducedHeight = dimensions.height / commonDivisor;
	const decimalRatio = (dimensions.width / dimensions.height).toFixed(4);

	return `${dimensions.width} × ${dimensions.height} px · aspect ratio ${reducedWidth}:${reducedHeight} (${decimalRatio})`;
}

/**
 * Scales one comparison image against the widest aspect ratio so both images
 * render at the same height without stretching or cropping either image.
 */
function calculateComparisonImageWidth(
	dimensions: ImagePixelDimensions | null,
	comparisonDimensions: ImagePixelDimensions | null,
): string {
	if (!dimensions || !comparisonDimensions) {
		return "100%";
	}

	const aspectRatio = dimensions.width / dimensions.height;
	const comparisonAspectRatio =
		comparisonDimensions.width / comparisonDimensions.height;
	const widestAspectRatio = Math.max(aspectRatio, comparisonAspectRatio);

	return `${(aspectRatio / widestAspectRatio) * 100}%`;
}

/** Finds the greatest common divisor of positive integers via Euclid's algorithm. */
function greatestCommonDivisor(
	firstValue: number,
	secondValue: number,
): number {
	let dividend = firstValue;
	let divisor = secondValue;

	while (divisor !== 0) {
		const remainder = dividend % divisor;
		dividend = divisor;
		divisor = remainder;
	}

	return dividend;
}

/** Preserves ordinary Error messages and supplies safe text for unknown failures. */
function getErrorMessage(err: unknown): string {
	return err instanceof Error
		? err.message
		: "An unexpected error occurred while processing the images.";
}
