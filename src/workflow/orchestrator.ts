import fs from "fs/promises";
import path from "path";

import type { FolderConfig } from "../config";
import type { Logger } from "../logger";
import type { AiClient } from "./aiClient";
import type { FileToolRegistry } from "../tools/fileTools";

interface FileMetadata {
	// File system metadata (always available)
	created?: string; // ISO date string
	modified?: string; // ISO date string
	// EXIF metadata for images
	exif?: Record<string, unknown>;
	// PDF metadata
	pdf?: {
		title?: string;
		author?: string;
		subject?: string;
		creator?: string;
		producer?: string;
		creationDate?: string;
		modificationDate?: string;
		pages?: number;
	};
}

interface FileEvent {
	type: "add";
	absolutePath: string;
	relativePath: string;
	size?: number;
	mimeType?: string;
	metadata?: FileMetadata;
}

/**
 * Detect MIME type from file extension.
 * Returns undefined for text files that should be read as UTF-8.
 */
function detectMimeType(filePath: string): string | undefined {
	const ext = path.extname(filePath).toLowerCase();

	// Common binary file types that should be passed as file parts
	const mimeTypes: Record<string, string> = {
		// Documents
		".pdf": "application/pdf",
		".doc": "application/msword",
		".docx":
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".xls": "application/vnd.ms-excel",
		".xlsx":
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".ppt": "application/vnd.ms-powerpoint",
		".pptx":
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",

		// Images
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".gif": "image/gif",
		".webp": "image/webp",
		".svg": "image/svg+xml",
		".bmp": "image/bmp",
		".ico": "image/x-icon",

		// Audio
		".mp3": "audio/mpeg",
		".wav": "audio/wav",
		".ogg": "audio/ogg",
		".m4a": "audio/mp4",

		// Video
		".mp4": "video/mp4",
		".avi": "video/x-msvideo",
		".mov": "video/quicktime",
		".webm": "video/webm",

		// Archives
		".zip": "application/zip",
		".tar": "application/x-tar",
		".gz": "application/gzip",
		".rar": "application/vnd.rar",

		// Other
		".json": "application/json",
		".xml": "application/xml",
		".csv": "text/csv",
	};

	return mimeTypes[ext];
}

/**
 * Check if a file should be treated as binary (passed as file part) vs text (read as UTF-8).
 */
function isBinaryFile(mimeType: string | undefined): boolean {
	if (!mimeType) {
		return false;
	}

	// Text files that can be read as UTF-8
	const textMimeTypes = [
		"text/",
		"application/json",
		"application/xml",
		"text/csv",
	];

	// If it's a text MIME type, don't treat as binary
	if (textMimeTypes.some((prefix) => mimeType.startsWith(prefix))) {
		return false;
	}

	return true;
}

/**
 * Extract EXIF metadata from image files.
 * Uses exifr library if available, otherwise returns undefined.
 */
async function extractExifMetadata(
	filePath: string,
): Promise<Record<string, unknown> | undefined> {
	try {
		// Dynamic import to avoid requiring the library if not installed
		const exifr = await import("exifr").catch(() => null);
		if (!exifr) {
			return undefined;
		}

		// Extract common EXIF fields
		const exifData = await exifr.parse(filePath, {
			// Extract commonly useful fields
			pick: [
				"Make",
				"Model",
				"DateTimeOriginal",
				"DateTime",
				"GPSLatitude",
				"GPSLongitude",
				"ImageWidth",
				"ImageHeight",
				"Orientation",
				"ISO",
				"FNumber",
				"ExposureTime",
				"FocalLength",
				"LensModel",
				"Software",
			],
		});

		return exifData || undefined;
	} catch {
		// Silently fail if extraction fails
		return undefined;
	}
}

/**
 * Extract metadata from PDF files.
 * Uses pdf-parse library if available, otherwise returns undefined.
 */
async function extractPdfMetadata(filePath: string): Promise<
	| {
			title?: string;
			author?: string;
			subject?: string;
			creator?: string;
			producer?: string;
			creationDate?: string;
			modificationDate?: string;
			pages?: number;
	  }
	| undefined
> {
	try {
		// Dynamic import to avoid requiring the library if not installed
		const pdfParse = await import("pdf-parse").catch(() => null);
		if (!pdfParse) {
			return undefined;
		}

		const dataBuffer = await fs.readFile(filePath);
		const pdfData = await pdfParse.default(dataBuffer);

		const metadata: {
			title?: string;
			author?: string;
			subject?: string;
			creator?: string;
			producer?: string;
			creationDate?: string;
			modificationDate?: string;
			pages?: number;
		} = {};

		if (pdfData.info) {
			if (pdfData.info.Title) metadata.title = pdfData.info.Title;
			if (pdfData.info.Author) metadata.author = pdfData.info.Author;
			if (pdfData.info.Subject) metadata.subject = pdfData.info.Subject;
			if (pdfData.info.Creator) metadata.creator = pdfData.info.Creator;
			if (pdfData.info.Producer) metadata.producer = pdfData.info.Producer;
			if (pdfData.info.CreationDate)
				metadata.creationDate = pdfData.info.CreationDate.toString();
			if (pdfData.info.ModDate)
				metadata.modificationDate = pdfData.info.ModDate.toString();
		}

		if (pdfData.numpages) {
			metadata.pages = pdfData.numpages;
		}

		return Object.keys(metadata).length > 0 ? metadata : undefined;
	} catch {
		// Silently fail if extraction fails
		return undefined;
	}
}

export class WorkflowOrchestrator {
	private readonly aiClient: AiClient;
	private readonly tools: FileToolRegistry;
	private readonly logger: Logger;
	private readonly maxToolCalls: number;
	private readonly queues = new Map<string, Promise<void>>();
	// Track files created/modified by AI tools to prevent infinite loops
	private readonly ignoredFiles = new Map<string, number>(); // path -> timestamp
	private readonly ignoredFileTimeouts = new Map<string, NodeJS.Timeout>(); // path -> timeout
	private readonly IGNORE_DURATION_MS = 10000; // Ignore files for 10 seconds after modification

	constructor(
		aiClient: AiClient,
		tools: FileToolRegistry,
		logger: Logger,
		maxToolCalls: number,
	) {
		this.aiClient = aiClient;
		this.tools = tools;
		this.logger = logger;
		this.maxToolCalls = maxToolCalls;
	}

	enqueueFile(folder: FolderConfig, filePath: string, dryRun: boolean): void {
		// Check if this file should be ignored (was created/modified by AI)
		if (this.isFileIgnored(filePath)) {
			const folderLogger = this.logger.child({ folder: folder.path });
			folderLogger.debug(
				{ file: filePath },
				"Ignoring file change (created/modified by AI workflow).",
			);
			return;
		}

		const queueKey = folder.path;
		const prev = this.queues.get(queueKey) ?? Promise.resolve();
		const next = prev
			.catch(() => undefined)
			.then(() => this.runJob(folder, filePath, dryRun))
			.catch((error) => {
				this.logger.error(
					{ folder: folder.path, err: (error as Error).message },
					"Workflow failed.",
				);
			});
		this.queues.set(queueKey, next);
	}

	private async runJob(
		folder: FolderConfig,
		filePath: string,
		dryRunFlag: boolean,
	): Promise<void> {
		const event = await this.buildFileEvent(folder, filePath);
		const folderLogger = this.logger.child({
			folder: folder.path,
			file: event.relativePath,
		});
		folderLogger.info({ event }, "Running workflow.");

		if (!this.aiClient.isConfigured()) {
			folderLogger.warn("AI client is not configured. Skipping workflow.");
			return;
		}

		const toolIds = folder.tools;
		const toolDefinitions = this.tools.getToolDefinitions(toolIds);

		if (toolDefinitions.length === 0) {
			folderLogger.warn("No tools available for folder. Skipping workflow.");
			return;
		}

		const systemPrompt = buildSystemPrompt(folder.prompt);
		const userPrompt = await buildUserPrompt(event);

		// Track files modified during this workflow to prevent infinite loops
		const modifiedFiles: string[] = [];

		try {
			const result = await this.aiClient.runWorkflow({
				systemPrompt,
				userPrompt,
				tools: toolDefinitions,
				availableToolIds: toolIds,
				maxToolCalls: this.maxToolCalls,
				toolContextFactory: (toolId) => ({
					folder,
					logger: folderLogger.child({ tool: toolId }),
					dryRun: dryRunFlag || folder.dryRun,
					onFileModified: (filePath: string) => {
						modifiedFiles.push(filePath);
						this.ignoreFile(filePath);
					},
				}),
				invokeTool: async (toolId, args, ctx) =>
					this.tools.invokeTool(toolId, args, ctx),
			});
			folderLogger.info({ result }, "Workflow finished.");
			await this.appendHistory(folder.historyLogPath, {
				timestamp: new Date().toISOString(),
				file: event.relativePath,
				result,
			});
		} catch (error) {
			folderLogger.error(
				{ err: (error as Error).message },
				"Workflow run failed.",
			);
			await this.appendHistory(folder.historyLogPath, {
				timestamp: new Date().toISOString(),
				file: event.relativePath,
				error: (error as Error).message,
			});
		}
	}

	private async buildFileEvent(
		folder: FolderConfig,
		absolutePath: string,
	): Promise<FileEvent> {
		const relativePath =
			path.relative(folder.path, absolutePath) || path.basename(absolutePath);
		let size: number | undefined;
		let mimeType: string | undefined;
		let metadata: FileMetadata | undefined;

		try {
			const stats = await fs.stat(absolutePath);
			size = stats.size;
			mimeType = detectMimeType(absolutePath);

			// Extract file system metadata
			metadata = {
				created: stats.birthtime.toISOString(),
				modified: stats.mtime.toISOString(),
			};

			// Extract EXIF for images
			if (mimeType?.startsWith("image/")) {
				const exifData = await extractExifMetadata(absolutePath);
				if (exifData && Object.keys(exifData).length > 0) {
					metadata.exif = exifData;
				}
			}

			// Extract PDF metadata
			if (mimeType === "application/pdf") {
				const pdfData = await extractPdfMetadata(absolutePath);
				if (pdfData && Object.keys(pdfData).length > 0) {
					metadata.pdf = pdfData;
				}
			}
		} catch {
			size = undefined;
			mimeType = undefined;
			metadata = undefined;
		}

		return {
			type: "add",
			absolutePath,
			relativePath,
			size,
			mimeType,
			metadata,
		};
	}

	private async appendHistory(
		historyPath: string,
		record: Record<string, unknown>,
	): Promise<void> {
		try {
			await fs.appendFile(historyPath, JSON.stringify(record) + "\n", "utf8");
		} catch (error) {
			this.logger.warn(
				{ err: (error as Error).message, historyPath },
				"Failed to append workflow history.",
			);
		}
	}

	/**
	 * Mark a file as ignored to prevent it from triggering workflows.
	 * Files are automatically removed from the ignore list after IGNORE_DURATION_MS.
	 */
	private ignoreFile(filePath: string): void {
		const normalizedPath = path.resolve(filePath);

		// Clear existing timeout if rescheduling
		const existingTimeout = this.ignoredFileTimeouts.get(normalizedPath);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		this.ignoredFiles.set(normalizedPath, Date.now());
		this.scheduleCleanup(normalizedPath);
	}

	/**
	 * Check if a file should be ignored (was recently created/modified by AI).
	 */
	private isFileIgnored(filePath: string): boolean {
		const normalizedPath = path.resolve(filePath);
		const timestamp = this.ignoredFiles.get(normalizedPath);
		if (!timestamp) {
			return false;
		}
		const age = Date.now() - timestamp;
		if (age > this.IGNORE_DURATION_MS) {
			// Entry expired, remove it
			this.ignoredFiles.delete(normalizedPath);
			return false;
		}
		return true;
	}

	/**
	 * Schedule cleanup of an ignored file entry after the ignore duration.
	 */
	private scheduleCleanup(filePath: string): void {
		const timeout = setTimeout(() => {
			this.ignoredFiles.delete(filePath);
			this.ignoredFileTimeouts.delete(filePath);
		}, this.IGNORE_DURATION_MS);

		this.ignoredFileTimeouts.set(filePath, timeout);
	}
}

function buildSystemPrompt(folderPrompt: string): string {
	return `<user_prompt>
${folderPrompt}
</user_prompt>

<system_instructions>
You are provided with tool calls (read/write/rename) and must keep user files safe. Never overwrite unless explicitly allowed.

CRITICAL: Never guess or assume missing information. If you cannot extract required information from the file content, do NOT rename the file. Only rename when you have clear, unambiguous information.

IMPORTANT ABOUT FILE CREATION: Use write_file SPARINGLY and ONLY when the prompt explicitly asks you to create a new file (like creating summaries, reports, or metadata files). When a file was just added and you need to change its name, ALWAYS use rename_file, never write_file. Creating unnecessary files clutters the folder and wastes resources.

CRITICAL ABOUT TOOL RESULTS: Always check the results of your tool calls before making new tool calls. If a rename_file operation succeeds, the file's name has changed - use the NEW filename (shown in the tool result) for any subsequent operations. Do NOT attempt to rename a file using its old name after it has already been renamed. If a tool call fails because a file doesn't exist, check if it was renamed or moved in a previous tool call.
</system_instructions>`;
}

// Threshold for automatically truncating text files (10KB)
const TEXT_FILE_TRUNCATE_THRESHOLD = 10 * 1024; // 10KB
// Number of lines to include from head and tail for large files
const HEAD_LINES = 50;
const TAIL_LINES = 50;
// Maximum file size for binary files (images, PDFs, etc.) - 20MB
const MAX_BINARY_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Build user prompt with file parts for binary files (PDFs, images, etc.).
 * Returns either a string (for text files) or an array with text and file parts.
 */
async function buildUserPrompt(
	event: FileEvent,
): Promise<
	| string
	| Array<
			| { type: "text"; text: string }
			| { type: "image"; image: string }
			| { type: "file"; data: Buffer; mediaType: string }
	  >
> {
	const originalExtension = path.extname(event.relativePath);
	const isCsv = originalExtension.toLowerCase() === ".csv";
	const isTextFile = !event.mimeType || !isBinaryFile(event.mimeType);
	const isLargeTextFile =
		isTextFile && event.size && event.size > TEXT_FILE_TRUNCATE_THRESHOLD;

	// Metadata is ALWAYS extracted and included when available
	// File system metadata (created/modified) is always extracted if file stats succeed
	// EXIF metadata is extracted for images (if exifr is installed)
	// PDF metadata is extracted for PDFs (if pdf-parse is installed)
	let metadataInfo = "";
	if (event.metadata) {
		const metadataParts: string[] = [];

		// File system metadata (always available if file stats succeeded)
		if (event.metadata.created || event.metadata.modified) {
			const fsMeta: string[] = [];
			if (event.metadata.created) {
				fsMeta.push(`Created: ${event.metadata.created}`);
			}
			if (event.metadata.modified) {
				fsMeta.push(`Modified: ${event.metadata.modified}`);
			}
			if (fsMeta.length > 0) {
				metadataParts.push(`File System: ${fsMeta.join(", ")}`);
			}
		}

		// EXIF metadata for images
		if (event.metadata.exif && Object.keys(event.metadata.exif).length > 0) {
			const exifFields: string[] = [];
			const exif = event.metadata.exif;

			if (exif.Make || exif.Model) {
				exifFields.push(
					`Camera: ${exif.Make || ""} ${exif.Model || ""}`.trim(),
				);
			}
			if (exif.DateTimeOriginal || exif.DateTime) {
				exifFields.push(
					`Date Taken: ${exif.DateTimeOriginal || exif.DateTime}`,
				);
			}
			if (exif.ImageWidth && exif.ImageHeight) {
				exifFields.push(`Dimensions: ${exif.ImageWidth}x${exif.ImageHeight}`);
			}
			if (exif.GPSLatitude && exif.GPSLongitude) {
				exifFields.push(`Location: ${exif.GPSLatitude}, ${exif.GPSLongitude}`);
			}
			if (exif.ISO) {
				exifFields.push(`ISO: ${exif.ISO}`);
			}
			if (exif.FNumber) {
				exifFields.push(`Aperture: f/${exif.FNumber}`);
			}
			if (exif.ExposureTime) {
				exifFields.push(`Exposure: ${exif.ExposureTime}s`);
			}
			if (exif.FocalLength) {
				exifFields.push(`Focal Length: ${exif.FocalLength}mm`);
			}
			if (exif.LensModel) {
				exifFields.push(`Lens: ${exif.LensModel}`);
			}

			if (exifFields.length > 0) {
				metadataParts.push(`EXIF: ${exifFields.join("; ")}`);
			}
		}

		// PDF metadata
		if (event.metadata.pdf && Object.keys(event.metadata.pdf).length > 0) {
			const pdfFields: string[] = [];
			const pdf = event.metadata.pdf;

			if (pdf.title) pdfFields.push(`Title: ${pdf.title}`);
			if (pdf.author) pdfFields.push(`Author: ${pdf.author}`);
			if (pdf.subject) pdfFields.push(`Subject: ${pdf.subject}`);
			if (pdf.creator) pdfFields.push(`Creator: ${pdf.creator}`);
			if (pdf.producer) pdfFields.push(`Producer: ${pdf.producer}`);
			if (pdf.creationDate) pdfFields.push(`Created: ${pdf.creationDate}`);
			if (pdf.modificationDate)
				pdfFields.push(`Modified: ${pdf.modificationDate}`);
			if (pdf.pages) pdfFields.push(`Pages: ${pdf.pages}`);

			if (pdfFields.length > 0) {
				metadataParts.push(`PDF: ${pdfFields.join("; ")}`);
			}
		}

		if (metadataParts.length > 0) {
			metadataInfo = `\n\nFile Metadata:\n${metadataParts.join("\n")}`;
		}
	}

	let fileContentPreview = "";

	// Text file content handling:
	// - Files > 10KB: Only send head + tail (truncated) to avoid sending large files
	// - Files <= 10KB: Send full content (small enough to be reasonable)
	// - Binary files (PDFs, images): Sent as file parts (handled separately below)
	// For large text files, automatically include head and tail
	if (isLargeTextFile) {
		try {
			const content = await fs.readFile(event.absolutePath, "utf8");
			const lines = content.split(/\r?\n/);
			const totalLines = lines.length;

			if (totalLines > HEAD_LINES + TAIL_LINES) {
				// For CSV files, always include the header row separately
				const headerLine = isCsv && lines.length > 0 ? lines[0] : null;
				// Skip header in headLines if we're including it separately
				const headStart = headerLine ? 1 : 0;
				const headLines = lines.slice(headStart, HEAD_LINES + headStart);
				const tailLines = lines.slice(-TAIL_LINES);

				const previewLines: string[] = [];
				if (headerLine) {
					previewLines.push(headerLine);
					previewLines.push(""); // Empty line separator
				}
				previewLines.push(...headLines);
				previewLines.push("");
				previewLines.push(
					`... (${totalLines - HEAD_LINES - TAIL_LINES - (headerLine ? 1 : 0)} lines omitted) ...`,
				);
				previewLines.push("");
				previewLines.push(...tailLines);

				fileContentPreview = `\n\nFile content preview (truncated - showing first ${HEAD_LINES} and last ${TAIL_LINES} lines${headerLine ? ", header preserved" : ""}):\n\n\`\`\`\n${previewLines.join("\n")}\n\`\`\``;
			} else {
				// File is not that large, include full content
				fileContentPreview = `\n\nFile content:\n\n\`\`\`\n${content}\n\`\`\``;
			}
		} catch (error) {
			// If we can't read the file, continue without content preview
			fileContentPreview = `\n\n(Unable to read file content: ${(error as Error).message})`;
		}
	} else if (
		isTextFile &&
		event.size &&
		event.size <= TEXT_FILE_TRUNCATE_THRESHOLD
	) {
		// For small text files, include full content
		try {
			const content = await fs.readFile(event.absolutePath, "utf8");
			fileContentPreview = `\n\nFile content:\n\n\`\`\`\n${content}\n\`\`\``;
		} catch (error) {
			// If we can't read the file, continue without content preview
			fileContentPreview = `\n\n(Unable to read file content: ${(error as Error).message})`;
		}
	}

	const textPart = `A new file was added: ${event.relativePath}${event.size ? ` (${event.size} bytes)` : ""}.${metadataInfo}${fileContentPreview}

IMPORTANT: If you need to change this file's name, use rename_file with 'from'="${event.relativePath}" and 'to'="<new-name>${originalExtension}". You MUST preserve the original file extension (${originalExtension}). 

CRITICAL: Do NOT use write_file - that creates a new file and leaves the original untouched. Only use write_file if the prompt explicitly asks you to create a new file (like a summary or report). For renaming, ALWAYS use rename_file.`;

	// If it's a binary file (PDF, image, etc.), include it as a file part
	// Note: Binary files are sent in full as the AI SDK needs complete files to process images/PDFs
	// For text files, we truncate at 10KB threshold (see above)
	if (event.mimeType && isBinaryFile(event.mimeType)) {
		try {
			// Check file size before reading
			if (event.size && event.size > MAX_BINARY_FILE_SIZE) {
				return `${textPart}\n\nWARNING: File size (${event.size} bytes) exceeds the maximum supported size (${MAX_BINARY_FILE_SIZE} bytes). The file cannot be processed by the AI model.`;
			}

			const fileData = await fs.readFile(event.absolutePath);
			const isImage = event.mimeType.startsWith("image/");

			// For images, use type: 'image' with base64-encoded string
			// The gateway requires base64 encoding for images
			// For other binary files (PDFs, etc.), use type: 'file' with Buffer and mediaType
			if (isImage) {
				// Convert Buffer to base64 string for gateway compatibility
				const base64Image = fileData.toString("base64");
				return [
					{ type: "text" as const, text: textPart },
					{
						type: "image" as const,
						image: base64Image,
					},
				];
			} else {
				return [
					{ type: "text" as const, text: textPart },
					{
						type: "file" as const,
						data: fileData,
						mediaType: event.mimeType,
					},
				];
			}
		} catch (error) {
			// If we can't read the file, fall back to text-only prompt
			return `${textPart} (Unable to read file as binary: ${(error as Error).message})`;
		}
	}

	// For text files, return the prompt with content preview
	return textPart;
}
