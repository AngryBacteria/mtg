import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	addPrintBleedToImages,
	createPrintBleedFileName,
	type PrintBleedImageInput,
	type PrintBleedMode,
} from "./addPrintBleed";

/** Minimal decoded-image double used to verify rendering and cleanup. */
interface ImageBitmapDouble {
	width: number;
	height: number;
	close: ReturnType<typeof vi.fn>;
}

/** Canvas harness exposing every rendering operation for exact assertions. */
interface CanvasHarness {
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	drawImage: ReturnType<typeof vi.fn>;
	fillRect: ReturnType<typeof vi.fn>;
	toBlob: ReturnType<typeof vi.fn>;
}

/** Creates a decoded image double with observable resource cleanup. */
function createBitmap(width: number, height: number): ImageBitmapDouble {
	return { width, height, close: vi.fn() };
}

/** Creates a canvas double that encodes a deterministic PNG payload. */
function createCanvasHarness(
	encodedBlob: Blob | null = new Blob(["png"], { type: "image/png" }),
): CanvasHarness {
	const drawImage = vi.fn();
	const fillRect = vi.fn();
	const context = {
		drawImage,
		fillRect,
		fillStyle: "",
	} as unknown as CanvasRenderingContext2D;
	const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
		expect(type).toBe("image/png");
		callback(encodedBlob);
	});
	const canvas = {
		width: 0,
		height: 0,
		getContext: vi.fn(() => context),
		toBlob,
	} as unknown as HTMLCanvasElement;

	return { canvas, context, drawImage, fillRect, toBlob };
}

/** Creates a browser File input with stable metadata for output assertions. */
function createImageFile(
	name = "card.jpg",
	type = "image/jpeg",
	lastModified = 123_456,
): File {
	return new File(["source"], name, { type, lastModified });
}

describe("addPrintBleedToImages", () => {
	beforeEach(() => {
		vi.stubGlobal("createImageBitmap", vi.fn());
		vi.stubGlobal("document", { createElement: vi.fn() });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns no results and performs no browser work for an empty collection", async () => {
		await expect(addPrintBleedToImages([])).resolves.toEqual([]);
		expect(createImageBitmap).not.toHaveBeenCalled();
		expect(document.createElement).not.toHaveBeenCalled();
	});

	it.each([
		{
			width: 750,
			height: 1050,
			normalizedWidth: 750,
			normalizedHeight: 1050,
			dpi: 300,
			bleed: 36,
		},
		{
			width: 1500,
			height: 2100,
			normalizedWidth: 1500,
			normalizedHeight: 2100,
			dpi: 600,
			bleed: 72,
		},
		{
			width: 375,
			height: 525,
			normalizedWidth: 375,
			normalizedHeight: 525,
			dpi: 150,
			bleed: 18,
		},
		{
			width: 751,
			height: 1050,
			normalizedWidth: 750,
			normalizedHeight: 1050,
			dpi: 300,
			bleed: 36,
		},
	])(
		"infers $dpi DPI and $bleed bleed pixels from a $width x $height portrait",
		async ({
			width,
			height,
			normalizedWidth,
			normalizedHeight,
			dpi,
			bleed,
		}) => {
			const bitmap = createBitmap(width, height);
			const harness = createCanvasHarness();
			vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
			vi.mocked(document.createElement).mockReturnValue(harness.canvas);

			const [result] = await addPrintBleedToImages([createImageFile()]);

			expect(result).toMatchObject({
				sourceWidth: width,
				sourceHeight: height,
				outputWidth: normalizedWidth + bleed * 2,
				outputHeight: normalizedHeight + bleed * 2,
				dpi,
				bleedPixelsPerEdge: bleed,
				meetsMinimumDpi: dpi >= 300,
			});
			expect(harness.canvas.width).toBe(normalizedWidth + bleed * 2);
			expect(harness.canvas.height).toBe(normalizedHeight + bleed * 2);
			expect(bitmap.close).toHaveBeenCalledOnce();
		},
	);

	it("rotates physical dimensions when calculating landscape image DPI", async () => {
		const bitmap = createBitmap(1050, 750);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		const [result] = await addPrintBleedToImages([createImageFile()]);

		expect(result).toMatchObject({ dpi: 300, bleedPixelsPerEdge: 36 });
		expect(harness.canvas).toMatchObject({ width: 1122, height: 822 });
	});

	it("center-crops a tall portrait before adding bleed", async () => {
		const bitmap = createBitmap(750, 1400);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		const [result] = await addPrintBleedToImages([createImageFile()]);

		expect(result).toMatchObject({
			outputWidth: 822,
			outputHeight: 1122,
			dpi: 300,
			bleedPixelsPerEdge: 36,
		});
		expect(harness.canvas).toMatchObject({ width: 822, height: 1122 });
		expect(
			harness.drawImage.mock.calls
				.slice(0, 4)
				.map((drawCall) => drawCall.slice(1, 5)),
		).toEqual([
			[0, 175, 750, 1],
			[0, 1224, 750, 1],
			[0, 175, 1, 1050],
			[749, 175, 1, 1050],
		]);
		expect(harness.drawImage).toHaveBeenLastCalledWith(
			bitmap,
			0,
			175,
			750,
			1050,
			36,
			36,
			750,
			1050,
		);
	});

	it("center-crops a wide landscape before adding bleed", async () => {
		const bitmap = createBitmap(1400, 750);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		const [result] = await addPrintBleedToImages([createImageFile()]);

		expect(result).toMatchObject({
			outputWidth: 1122,
			outputHeight: 822,
			dpi: 300,
			bleedPixelsPerEdge: 36,
		});
		expect(harness.canvas).toMatchObject({ width: 1122, height: 822 });
		expect(
			harness.drawImage.mock.calls
				.slice(0, 4)
				.map((drawCall) => drawCall.slice(1, 5)),
		).toEqual([
			[175, 0, 1050, 1],
			[175, 749, 1050, 1],
			[175, 0, 1, 750],
			[1224, 0, 1, 750],
		]);
		expect(harness.drawImage).toHaveBeenLastCalledWith(
			bitmap,
			175,
			0,
			1050,
			750,
			36,
			36,
			1050,
			750,
		);
	});

	it("supports custom card dimensions and minimum DPI", async () => {
		const bitmap = createBitmap(600, 1200);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		const [result] = await addPrintBleedToImages([createImageFile()], {
			cardDimensions: { width: 2, height: 4 },
			minimumDpi: 301,
		});

		expect(result).toMatchObject({
			dpi: 300,
			bleedPixelsPerEdge: 36,
			meetsMinimumDpi: false,
		});
	});

	it("accepts custom card dimensions supplied in landscape order", async () => {
		const bitmap = createBitmap(1200, 600);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		const [result] = await addPrintBleedToImages([createImageFile()], {
			cardDimensions: { width: 4, height: 2 },
		});

		expect(result).toMatchObject({
			dpi: 300,
			bleedPixelsPerEdge: 36,
			outputWidth: 1272,
			outputHeight: 672,
		});
		expect(harness.drawImage).toHaveBeenLastCalledWith(
			bitmap,
			0,
			0,
			1200,
			600,
			36,
			36,
			1200,
			600,
		);
	});

	it("extends the literal outermost pixels by default", async () => {
		const bitmap = createBitmap(750, 1050);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		await addPrintBleedToImages([createImageFile()]);

		expect(harness.context.fillStyle).toBe("#000000");
		expect(harness.fillRect).toHaveBeenCalledWith(0, 0, 822, 1122);
		expect(harness.drawImage.mock.calls).toEqual([
			[bitmap, 0, 0, 750, 1, 36, 0, 750, 36],
			[bitmap, 0, 1049, 750, 1, 36, 1086, 750, 36],
			[bitmap, 0, 0, 1, 1050, 0, 36, 36, 1050],
			[bitmap, 749, 0, 1, 1050, 786, 36, 36, 1050],
			[bitmap, 0, 0, 1, 1, 0, 0, 36, 36],
			[bitmap, 749, 0, 1, 1, 786, 0, 36, 36],
			[bitmap, 0, 1049, 1, 1, 0, 1086, 36, 36],
			[bitmap, 749, 1049, 1, 1, 786, 1086, 36, 36],
			[bitmap, 0, 0, 750, 1050, 36, 36, 750, 1050],
		]);
	});

	it("uses the configured inset for every extended edge and corner", async () => {
		const bitmap = createBitmap(750, 1050);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		await addPrintBleedToImages([
			{
				file: createImageFile(),
				mode: "extend",
				edgeSampleInsetPixels: 12,
			},
		]);

		expect(harness.drawImage.mock.calls.slice(0, 8)).toEqual([
			[bitmap, 0, 12, 750, 1, 36, 0, 750, 36],
			[bitmap, 0, 1037, 750, 1, 36, 1086, 750, 36],
			[bitmap, 12, 0, 1, 1050, 0, 36, 36, 1050],
			[bitmap, 737, 0, 1, 1050, 786, 36, 36, 1050],
			[bitmap, 12, 12, 1, 1, 0, 0, 36, 36],
			[bitmap, 737, 12, 1, 1, 786, 0, 36, 36],
			[bitmap, 12, 1037, 1, 1, 0, 1086, 36, 36],
			[bitmap, 737, 1037, 1, 1, 786, 1086, 36, 36],
		]);
	});

	it("leaves the bleed solid black without sampling bordered-card pixels", async () => {
		const bitmap = createBitmap(750, 1050);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		await addPrintBleedToImages([
			{ file: createImageFile(), mode: "black", edgeSampleInsetPixels: 20 },
		]);

		expect(harness.fillRect).toHaveBeenCalledWith(0, 0, 822, 1122);
		expect(harness.drawImage.mock.calls).toEqual([
			[bitmap, 0, 0, 750, 1050, 36, 36, 750, 1050],
		]);
	});

	it("bounds inset corner samples for images smaller than the bleed", async () => {
		const bitmap = createBitmap(3, 3);
		const harness = createCanvasHarness();
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		await addPrintBleedToImages(
			[
				{
					file: createImageFile(),
					mode: "extend",
					edgeSampleInsetPixels: 36,
				},
			],
			{ cardDimensions: { width: 0.01, height: 0.01 } },
		);

		const cornerCalls = harness.drawImage.mock.calls.slice(4, 8);
		expect(cornerCalls.map((call) => call.slice(1, 5))).toEqual([
			[1, 1, 1, 1],
			[1, 1, 1, 1],
			[1, 1, 1, 1],
			[1, 1, 1, 1],
		]);
	});

	it("creates a PNG with a derived name and preserves the modification time", async () => {
		const bitmap = createBitmap(750, 1050);
		const harness = createCanvasHarness();
		const source = createImageFile("black.lotus.webp", "image/webp", 987_654);
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		const [result] = await addPrintBleedToImages([source]);

		expect(result?.file).toBeInstanceOf(File);
		expect(result?.file).toMatchObject({
			name: "black.lotus_withEdge.png",
			type: "image/png",
			lastModified: 987_654,
			size: 3,
		});
	});

	it("decodes images when the browser does not provide a MIME type", async () => {
		const bitmap = createBitmap(750, 1050);
		const harness = createCanvasHarness();
		const source = createImageFile("card.png", "");
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		const [result] = await addPrintBleedToImages([source]);

		expect(createImageBitmap).toHaveBeenCalledWith(source);
		expect(result?.outputWidth).toBe(822);
	});

	it("processes files sequentially and closes each bitmap before decoding the next", async () => {
		const firstBitmap = createBitmap(750, 1050);
		const secondBitmap = createBitmap(1500, 2100);
		const harnesses = [createCanvasHarness(), createCanvasHarness()];
		vi.mocked(createImageBitmap)
			.mockResolvedValueOnce(firstBitmap as ImageBitmap)
			.mockImplementationOnce(async () => {
				expect(firstBitmap.close).toHaveBeenCalledOnce();
				return secondBitmap as ImageBitmap;
			});
		vi.mocked(document.createElement)
			.mockReturnValueOnce(harnesses[0]?.canvas as HTMLCanvasElement)
			.mockReturnValueOnce(harnesses[1]?.canvas as HTMLCanvasElement);

		const results = await addPrintBleedToImages([
			createImageFile("one.png", "image/png"),
			createImageFile("two.png", "image/png"),
		]);

		expect(results).toHaveLength(2);
		expect(secondBitmap.close).toHaveBeenCalledOnce();
	});

	it.each([
		["cardDimensions.width", { cardDimensions: { width: 0, height: 3.5 } }],
		[
			"cardDimensions.height",
			{ cardDimensions: { width: 2.5, height: Infinity } },
		],
		["minimumDpi", { minimumDpi: Number.NaN }],
	])(
		"rejects invalid %s configuration before decoding",
		async (name, options) => {
			await expect(
				addPrintBleedToImages([createImageFile()], options),
			).rejects.toThrow(`${name} must be a positive, finite number`);
			expect(createImageBitmap).not.toHaveBeenCalled();
		},
	);

	it("rejects missing array-like entries", async () => {
		await expect(addPrintBleedToImages({ length: 1 })).rejects.toThrow(
			"Image at index 0 is missing",
		);
	});

	it("reports a clear error when an image input has no file", async () => {
		await expect(
			addPrintBleedToImages([{ mode: "extend" } as PrintBleedImageInput]),
		).rejects.toThrow("Image at index 0 must include a valid File");
		expect(createImageBitmap).not.toHaveBeenCalled();
	});

	it("wraps non-image errors with the source file name", async () => {
		const source = createImageFile("notes.txt", "text/plain");

		await expect(addPrintBleedToImages([source])).rejects.toMatchObject({
			message: 'Could not add print bleed to "notes.txt"',
			cause: expect.objectContaining({
				message: "The input file is not an image",
			}),
		});
		expect(createImageBitmap).not.toHaveBeenCalled();
	});

	it("rejects unsupported per-image bleed modes before decoding", async () => {
		await expect(
			addPrintBleedToImages([
				{ file: createImageFile(), mode: "white" as PrintBleedMode },
			]),
		).rejects.toMatchObject({
			cause: expect.objectContaining({
				message: 'mode must be either "black" or "extend"',
			}),
		});
		expect(createImageBitmap).not.toHaveBeenCalled();
	});

	it.each([-1, 1.5, Number.NaN, Infinity])(
		"rejects invalid edge sample inset %s before decoding",
		async (edgeSampleInsetPixels) => {
			await expect(
				addPrintBleedToImages([
					{
						file: createImageFile(),
						mode: "extend",
						edgeSampleInsetPixels,
					},
				]),
			).rejects.toMatchObject({
				cause: expect.objectContaining({
					message: "edgeSampleInsetPixels must be a non-negative integer",
				}),
			});
			expect(createImageBitmap).not.toHaveBeenCalled();
		},
	);

	it.each([
		[0, 1050],
		[750, 0],
		[Number.NaN, 1050],
		[750, Infinity],
	])(
		"rejects invalid decoded dimensions %s x %s and closes the bitmap",
		async (width, height) => {
			const bitmap = createBitmap(width, height);
			vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);

			await expect(
				addPrintBleedToImages([createImageFile()]),
			).rejects.toMatchObject({
				cause: expect.objectContaining({
					message: "The decoded image must have positive, finite dimensions",
				}),
			});
			expect(bitmap.close).toHaveBeenCalledOnce();
		},
	);

	it("reports unavailable canvas contexts and still closes the bitmap", async () => {
		const bitmap = createBitmap(750, 1050);
		const canvas = {
			width: 0,
			height: 0,
			getContext: vi.fn(() => null),
		} as unknown as HTMLCanvasElement;
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(canvas);

		await expect(
			addPrintBleedToImages([createImageFile()]),
		).rejects.toMatchObject({
			cause: expect.objectContaining({
				message: "The browser could not create a 2D canvas context",
			}),
		});
		expect(bitmap.close).toHaveBeenCalledOnce();
	});

	it("reports PNG encoding failures and still closes the bitmap", async () => {
		const bitmap = createBitmap(750, 1050);
		const harness = createCanvasHarness(null);
		vi.mocked(createImageBitmap).mockResolvedValue(bitmap as ImageBitmap);
		vi.mocked(document.createElement).mockReturnValue(harness.canvas);

		await expect(
			addPrintBleedToImages([createImageFile()]),
		).rejects.toMatchObject({
			cause: expect.objectContaining({
				message: "The browser could not encode the bleed image",
			}),
		});
		expect(bitmap.close).toHaveBeenCalledOnce();
	});
});

describe("createPrintBleedFileName", () => {
	it.each([
		["card.jpg", "card_withEdge.png"],
		["card.back.final.jpeg", "card.back.final_withEdge.png"],
		["card", "card_withEdge.png"],
		[".hidden", ".hidden_withEdge.png"],
		["card.", "card_withEdge.png"],
		["", "_withEdge.png"],
	])("converts %j to %j", (sourceName, expectedName) => {
		expect(createPrintBleedFileName(sourceName)).toBe(expectedName);
	});
});
