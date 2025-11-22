import fs from "fs/promises";
import path from "path";

import type { FolderConfig, ToolId } from "../config";
import type { Logger } from "../logger";

const MAX_READ_BYTES = 256 * 1024; // 256KB

/**
 * Check if a file extension indicates a binary file that should not be read/written with text tools.
 * Binary files (PDFs, images, etc.) are already passed as file parts to the AI.
 */
function isBinaryFileExtension(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	const binaryExtensions = [
		// Documents
		".pdf",
		".doc",
		".docx",
		".xls",
		".xlsx",
		".ppt",
		".pptx",
		// Images
		".jpg",
		".jpeg",
		".png",
		".gif",
		".webp",
		".svg",
		".bmp",
		".ico",
		// Audio
		".mp3",
		".wav",
		".ogg",
		".m4a",
		// Video
		".mp4",
		".avi",
		".mov",
		".webm",
		// Archives
		".zip",
		".tar",
		".gz",
		".rar",
	];
	return binaryExtensions.includes(ext);
}

type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
	type: "function";
	function: {
		name: ToolId;
		description: string;
		parameters: JsonSchema;
	};
}

export interface ToolInvocationContext {
	folder: FolderConfig;
	logger: Logger;
	dryRun: boolean;
	onFileModified?: (filePath: string) => void;
}

export interface ToolInvocationResult {
	success: boolean;
	output: string;
}

interface ToolHandler {
	definition: ToolDefinition;
	invoke: (
		args: Record<string, unknown>,
		ctx: ToolInvocationContext,
	) => Promise<ToolInvocationResult>;
}

export class FileToolRegistry {
	private handlers: Record<ToolId, ToolHandler>;

	constructor() {
		this.handlers = {
			read_file: createReadFileTool(),
			write_file: createWriteFileTool(),
			rename_file: createRenameFileTool(),
			move_file: createMoveFileTool(),
			grep: createGrepTool(),
			sed: createSedTool(),
			head: createHeadTool(),
			tail: createTailTool(),
			create_folder: createFolderTool(),
		};
	}

	getToolDefinitions(toolIds: ToolId[]): ToolDefinition[] {
		const unique = Array.from(new Set(toolIds));
		return unique
			.map((id) => this.handlers[id]?.definition)
			.filter((def): def is ToolDefinition => Boolean(def));
	}

	async invokeTool(
		id: ToolId,
		args: Record<string, unknown>,
		ctx: ToolInvocationContext,
	): Promise<ToolInvocationResult> {
		const handler = this.handlers[id];
		if (!handler) {
			throw new Error(`Unknown tool: ${id}`);
		}
		return handler.invoke(args, ctx);
	}
}

function createReadFileTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "read_file",
				description:
					"Read a UTF-8 text file relative to the watched folder. Use this to inspect text file contents before deciding on edits. Do NOT use this for binary files (PDFs, images, etc.) - those are already available in the file content.",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description:
								"Relative path to the text file (within the folder) to read. Must be a text file, not binary.",
						},
					},
					required: ["path"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const target = assertPathArgument(args.path, "path");

			// Reject binary file extensions - read_file is for text files only
			// Binary files (PDFs, images, etc.) are already passed as file parts to the AI
			if (isBinaryFileExtension(target)) {
				return errorResult(
					"read_file",
					target,
					new Error(
						"read_file cannot be used for binary files (PDFs, images, etc.). Binary files are already available in the file content - you can analyze them directly without reading.",
					),
				);
			}

			let data: string;
			try {
				const absolute = resolveWithinFolder(ctx.folder.path, target);
				const stats = await fs.stat(absolute);
				if (!stats.isFile()) {
					throw new Error("Target is not a file.");
				}
				if (stats.size > MAX_READ_BYTES) {
					throw new Error("File exceeds 256KB read limit.");
				}
				data = await fs.readFile(absolute, "utf8");
			} catch (error) {
				return errorResult("read_file", target, error);
			}
			return successResult("read_file", target, {
				bytes: Buffer.byteLength(data, "utf8"),
				preview: data,
			});
		},
	};
}

function createWriteFileTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "write_file",
				description:
					"Create a brand new UTF-8 text file that does not exist yet. Use this SPARINGLY and ONLY when the prompt explicitly asks you to create a new file (e.g., creating summaries, reports, metadata files, or documentation). IMPORTANT: If a file was just added and you want to change its name, ALWAYS use rename_file instead - NEVER use write_file for renaming. write_file creates a NEW file and leaves the original untouched. Do NOT create files unless explicitly requested by the prompt.",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description:
								"Relative path (within the watched folder) for the NEW file to create, e.g., reports/summary.txt. The file must not exist yet.",
						},
						contents: {
							type: "string",
							description: "UTF-8 text content to write into the new file.",
						},
					},
					required: ["path", "contents"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const target = assertPathArgument(args.path, "path");
			const contents = assertStringArgument(args.contents, "contents");

			// Reject binary file extensions - write_file is for text files only
			if (isBinaryFileExtension(target)) {
				return errorResult(
					"write_file",
					target,
					new Error(
						"write_file cannot be used for binary files (PDF, images, etc.). Use rename_file to rename existing files instead.",
					),
				);
			}

			if (ctx.dryRun) {
				ctx.logger.info(
					{ tool: "write_file", target },
					"Dry run: write_file skipped.",
				);
				return successResult("write_file", target, {
					skipped: true,
					reason: "dry_run",
				});
			}
			try {
				const absolute = resolveWithinFolder(ctx.folder.path, target);
				await ensureParentDir(absolute);
				await assertNotExists(absolute);
				await fs.writeFile(absolute, contents, "utf8");
				// Notify that a file was created/modified by AI
				ctx.onFileModified?.(absolute);
			} catch (error) {
				return errorResult("write_file", target, error);
			}
			return successResult("write_file", target, {
				bytes: Buffer.byteLength(contents, "utf8"),
			});
		},
	};
}

function createRenameFileTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "rename_file",
				description:
					"Rename or move an EXISTING file within the watched folder. This is the PRIMARY tool to use when a file was just added and you want to give it a better name. The file must already exist - you specify its current name in 'from' and the new name in 'to'. CRITICAL: You MUST preserve the original file extension in the new name (e.g., if renaming 'a.pdf', the new name must end with '.pdf'). This tool moves/renames the existing file, it does NOT create a new file. If you want to create a brand new file with new content, use write_file instead.",
				parameters: {
					type: "object",
					properties: {
						from: {
							type: "string",
							description:
								"Current filename/path of the EXISTING file that was just added (e.g., 'a.pdf' or 'invoice.pdf'). This file must already exist.",
						},
						to: {
							type: "string",
							description:
								"New filename/path for the file (e.g., '2025-01-Invoice-1234.pdf'). The new name should not exist yet. MUST include the same file extension as the original file (e.g., if 'from' is 'a.pdf', then 'to' must end with '.pdf').",
						},
					},
					required: ["from", "to"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const fromArg = assertPathArgument(args.from, "from");
			const toArg = assertPathArgument(args.to, "to");

			// Validate that the file extension is preserved
			const fromExt = path.extname(fromArg);
			const toExt = path.extname(toArg);
			if (fromExt && !toExt) {
				return errorResult(
					"rename_file",
					`${fromArg} -> ${toArg}`,
					new Error(
						`File extension must be preserved. Original file has extension '${fromExt}' but new name has no extension. Use '${toArg}${fromExt}' instead.`,
					),
				);
			}
			if (fromExt && toExt && fromExt !== toExt) {
				return errorResult(
					"rename_file",
					`${fromArg} -> ${toArg}`,
					new Error(
						`File extension must be preserved. Original file has extension '${fromExt}' but new name has '${toExt}'. Use '${path.basename(toArg, toExt)}${fromExt}' instead.`,
					),
				);
			}

			if (ctx.dryRun) {
				ctx.logger.info(
					{ tool: "rename_file", from: fromArg, to: toArg },
					"Dry run: rename_file skipped.",
				);
				return successResult("rename_file", `${fromArg} -> ${toArg}`, {
					skipped: true,
					reason: "dry_run",
				});
			}
			try {
				const fromPath = resolveWithinFolder(ctx.folder.path, fromArg);
				const toPath = resolveWithinFolder(ctx.folder.path, toArg);
				await assertExists(fromPath);
				await assertNotExists(toPath);
				await ensureParentDir(toPath);
				await fs.rename(fromPath, toPath);
				// Notify that files were modified by AI (both source and destination)
				// The destination is the new file location that will trigger the watcher
				ctx.onFileModified?.(toPath);
				// Also mark the source in case it's moved to a location that's still watched
				ctx.onFileModified?.(fromPath);
			} catch (error) {
				return errorResult("rename_file", `${fromArg} -> ${toArg}`, error);
			}
			// Return explicit feedback about the rename success, including the new filename
			// This helps the model understand the file state after the operation
			return successResult("rename_file", `${fromArg} -> ${toArg}`, {
				renamed: true,
				oldName: fromArg,
				newName: toArg,
				message: `File successfully renamed from "${fromArg}" to "${toArg}". The file is now located at "${toArg}".`,
			});
		},
	};
}

function createMoveFileTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "move_file",
				description:
					"Move an EXISTING file or directory to a different location within the watched folder. This tool is designed for organizing files into subdirectories. The source file/directory must already exist. If moving a file, you can optionally rename it during the move. CRITICAL: When moving a file, you MUST preserve the original file extension in the destination path (e.g., if moving 'a.pdf', the destination must end with '.pdf'). This tool moves the existing file/directory, it does NOT create a new one.",
				parameters: {
					type: "object",
					properties: {
						from: {
							type: "string",
							description:
								"Current path of the EXISTING file or directory to move (e.g., 'invoice.pdf' or 'documents/invoice.pdf'). This file/directory must already exist.",
						},
						to: {
							type: "string",
							description:
								"Destination path for the file or directory (e.g., 'archived/2025/invoice.pdf' or 'organized/invoice.pdf'). The destination should not exist yet. If moving a file, MUST include the same file extension as the original file (e.g., if 'from' is 'a.pdf', then 'to' must end with '.pdf').",
						},
					},
					required: ["from", "to"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const fromArg = assertPathArgument(args.from, "from");
			const toArg = assertPathArgument(args.to, "to");

			if (ctx.dryRun) {
				ctx.logger.info(
					{ tool: "move_file", from: fromArg, to: toArg },
					"Dry run: move_file skipped.",
				);
				return successResult("move_file", `${fromArg} -> ${toArg}`, {
					skipped: true,
					reason: "dry_run",
				});
			}

			try {
				const fromPath = resolveWithinFolder(ctx.folder.path, fromArg);
				const toPath = resolveWithinFolder(ctx.folder.path, toArg);
				await assertExists(fromPath);

				// Check if source is a file or directory
				const stats = await fs.stat(fromPath);
				const isFile = stats.isFile();

				// For files, validate that extension is preserved
				if (isFile) {
					const fromExt = path.extname(fromArg);
					const toExt = path.extname(toArg);
					if (fromExt && !toExt) {
						return errorResult(
							"move_file",
							`${fromArg} -> ${toArg}`,
							new Error(
								`File extension must be preserved. Original file has extension '${fromExt}' but destination has no extension. Use '${toArg}${fromExt}' instead.`,
							),
						);
					}
					if (fromExt && toExt && fromExt !== toExt) {
						return errorResult(
							"move_file",
							`${fromArg} -> ${toArg}`,
							new Error(
								`File extension must be preserved. Original file has extension '${fromExt}' but destination has '${toExt}'. Use '${path.basename(toArg, toExt)}${fromExt}' instead.`,
							),
						);
					}
				}

				await assertNotExists(toPath);
				await ensureParentDir(toPath);
				await fs.rename(fromPath, toPath);
				// Notify that files were modified by AI (both source and destination)
				// The destination is the new file location that will trigger the watcher
				ctx.onFileModified?.(toPath);
				// Also mark the source in case it's moved to a location that's still watched
				ctx.onFileModified?.(fromPath);
			} catch (error) {
				return errorResult("move_file", `${fromArg} -> ${toArg}`, error);
			}
			return successResult("move_file", `${fromArg} -> ${toArg}`, {});
		},
	};
}

function assertPathArgument(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Argument ${label} must be a non-empty string.`);
	}
	return value;
}

function assertStringArgument(value: unknown, label: string): string {
	if (typeof value !== "string") {
		throw new Error(`Argument ${label} must be a string.`);
	}
	return value;
}

function resolveWithinFolder(folderPath: string, target: string): string {
	const normalizedFolder = path.resolve(folderPath);
	const absolute = path.resolve(normalizedFolder, target);
	const relative = path.relative(normalizedFolder, absolute);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error("Path escapes the watched folder.");
	}
	return absolute;
}

async function ensureParentDir(filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
}

async function assertNotExists(filePath: string): Promise<void> {
	try {
		await fs.access(filePath);
		throw new Error("Target already exists.");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}
		throw err;
	}
}

async function assertExists(filePath: string): Promise<void> {
	try {
		await fs.access(filePath);
	} catch {
		throw new Error(
			`Source file does not exist. The file may have been renamed or moved already. Check if the file exists at a different location.`,
		);
	}
}

function successResult(
	tool: string,
	target: string,
	data: Record<string, unknown>,
): ToolInvocationResult {
	return {
		success: true,
		output: JSON.stringify({ tool, target, ...data }),
	};
}

function errorResult(
	tool: string,
	target: string,
	error: unknown,
): ToolInvocationResult {
	return {
		success: false,
		output: JSON.stringify({
			tool,
			target,
			error: (error as Error).message ?? "Unknown error",
		}),
	};
}

function createGrepTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "grep",
				description:
					"Search for a pattern in a UTF-8 text file. Returns matching lines with line numbers. Use this to find specific content before making edits. Do NOT use this for binary files (PDFs, images, etc.).",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description:
								"Relative path to the text file (within the folder) to search. Must be a text file, not binary.",
						},
						pattern: {
							type: "string",
							description:
								"Pattern to search for. This is treated as a literal string (not a regex). For case-insensitive search, use a lowercase pattern and the caseInsensitive option.",
						},
						caseInsensitive: {
							type: "boolean",
							description:
								"If true, perform case-insensitive search. Defaults to false.",
						},
					},
					required: ["path", "pattern"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const target = assertPathArgument(args.path, "path");
			const pattern = assertStringArgument(args.pattern, "pattern");
			const caseInsensitive = args.caseInsensitive === true;

			// Reject binary file extensions - grep is for text files only
			if (isBinaryFileExtension(target)) {
				return errorResult(
					"grep",
					target,
					new Error(
						"grep cannot be used for binary files (PDFs, images, etc.). Binary files are already available in the file content - you can analyze them directly without searching.",
					),
				);
			}

			let data: string;
			try {
				const absolute = resolveWithinFolder(ctx.folder.path, target);
				const stats = await fs.stat(absolute);
				if (!stats.isFile()) {
					throw new Error("Target is not a file.");
				}
				if (stats.size > MAX_READ_BYTES) {
					throw new Error("File exceeds 256KB read limit.");
				}
				data = await fs.readFile(absolute, "utf8");
			} catch (error) {
				return errorResult("grep", target, error);
			}

			// Search for pattern in file lines
			const lines = data.split(/\r?\n/);
			const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern;
			const matches: Array<{ line: number; content: string }> = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const searchLine = caseInsensitive ? line.toLowerCase() : line;
				if (searchLine.includes(searchPattern)) {
					matches.push({ line: i + 1, content: line });
				}
			}

			return successResult("grep", target, {
				pattern,
				caseInsensitive,
				matchesFound: matches.length,
				matches: matches.slice(0, 100), // Limit to first 100 matches
				truncated: matches.length > 100,
			});
		},
	};
}

function createSedTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "sed",
				description:
					"Perform find-and-replace operations on a UTF-8 text file. This tool replaces all occurrences of a pattern with replacement text. Use this to make targeted edits to existing files. Do NOT use this for binary files (PDFs, images, etc.).",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description:
								"Relative path to the text file (within the folder) to modify. Must be a text file, not binary. The file must already exist.",
						},
						find: {
							type: "string",
							description:
								"Pattern to find and replace. This is treated as a literal string (not a regex). All occurrences will be replaced.",
						},
						replace: {
							type: "string",
							description:
								"Replacement text. Use an empty string to delete the pattern.",
						},
						caseInsensitive: {
							type: "boolean",
							description:
								"If true, perform case-insensitive search. Defaults to false.",
						},
					},
					required: ["path", "find", "replace"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const target = assertPathArgument(args.path, "path");
			const find = assertStringArgument(args.find, "find");
			const replace = assertStringArgument(args.replace, "replace");
			const caseInsensitive = args.caseInsensitive === true;

			// Reject binary file extensions - sed is for text files only
			if (isBinaryFileExtension(target)) {
				return errorResult(
					"sed",
					target,
					new Error(
						"sed cannot be used for binary files (PDF, images, etc.). Use rename_file to rename existing files instead.",
					),
				);
			}

			if (ctx.dryRun) {
				ctx.logger.info(
					{ tool: "sed", target, find, replace },
					"Dry run: sed skipped.",
				);
				return successResult("sed", target, {
					skipped: true,
					reason: "dry_run",
					find,
					replace,
				});
			}

			let data: string;
			try {
				const absolute = resolveWithinFolder(ctx.folder.path, target);
				await assertExists(absolute);
				const stats = await fs.stat(absolute);
				if (!stats.isFile()) {
					throw new Error("Target is not a file.");
				}
				if (stats.size > MAX_READ_BYTES) {
					throw new Error("File exceeds 256KB read limit.");
				}
				data = await fs.readFile(absolute, "utf8");
			} catch (error) {
				return errorResult("sed", target, error);
			}

			// Perform find-and-replace
			let modified: string;
			let replacementCount = 0;

			if (caseInsensitive) {
				// Case-insensitive replacement
				const regex = new RegExp(
					find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
					"gi",
				);
				const matches = data.match(regex);
				replacementCount = matches ? matches.length : 0;
				modified = data.replace(regex, replace);
			} else {
				// Case-sensitive replacement
				const regex = new RegExp(
					find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
					"g",
				);
				const matches = data.match(regex);
				replacementCount = matches ? matches.length : 0;
				modified = data.replace(regex, replace);
			}

			// Only write if changes were made
			if (modified !== data) {
				try {
					const absolute = resolveWithinFolder(ctx.folder.path, target);
					await fs.writeFile(absolute, modified, "utf8");
					ctx.onFileModified?.(absolute);
				} catch (error) {
					return errorResult("sed", target, error);
				}
			}

			return successResult("sed", target, {
				find,
				replace,
				caseInsensitive,
				replacements: replacementCount,
				modified: modified !== data,
			});
		},
	};
}

function createHeadTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "head",
				description:
					"Read the first N lines of a UTF-8 text file. Use this to quickly preview the beginning of a file without reading the entire file. Do NOT use this for binary files (PDFs, images, etc.).",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description:
								"Relative path to the text file (within the folder) to read. Must be a text file, not binary.",
						},
						lines: {
							type: "number",
							description:
								"Number of lines to read from the beginning of the file. Defaults to 10 if not specified.",
						},
					},
					required: ["path"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const target = assertPathArgument(args.path, "path");

			// Reject binary file extensions - head is for text files only
			if (isBinaryFileExtension(target)) {
				return errorResult(
					"head",
					target,
					new Error(
						"head cannot be used for binary files (PDFs, images, etc.). Binary files are already available in the file content - you can analyze them directly without reading.",
					),
				);
			}

			let data: string;
			let lines: number;
			try {
				lines =
					args.lines !== undefined
						? expectPositiveInteger(args.lines, "lines")
						: 10;
				const absolute = resolveWithinFolder(ctx.folder.path, target);
				const stats = await fs.stat(absolute);
				if (!stats.isFile()) {
					throw new Error("Target is not a file.");
				}
				if (stats.size > MAX_READ_BYTES) {
					throw new Error("File exceeds 256KB read limit.");
				}
				data = await fs.readFile(absolute, "utf8");
			} catch (error) {
				return errorResult("head", target, error);
			}

			// Split into lines and take first N lines
			const fileLines = data.split(/\r?\n/);
			const requestedLines = Math.min(lines, fileLines.length);
			const headLines = fileLines.slice(0, requestedLines);
			const preview = headLines.join("\n");

			return successResult("head", target, {
				lines: requestedLines,
				totalLines: fileLines.length,
				preview,
			});
		},
	};
}

function createTailTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "tail",
				description:
					"Read the last N lines of a UTF-8 text file. Use this to quickly preview the end of a file without reading the entire file. Do NOT use this for binary files (PDFs, images, etc.).",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description:
								"Relative path to the text file (within the folder) to read. Must be a text file, not binary.",
						},
						lines: {
							type: "number",
							description:
								"Number of lines to read from the end of the file. Defaults to 10 if not specified.",
						},
					},
					required: ["path"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const target = assertPathArgument(args.path, "path");

			// Reject binary file extensions - tail is for text files only
			if (isBinaryFileExtension(target)) {
				return errorResult(
					"tail",
					target,
					new Error(
						"tail cannot be used for binary files (PDFs, images, etc.). Binary files are already available in the file content - you can analyze them directly without reading.",
					),
				);
			}

			let data: string;
			let lines: number;
			try {
				lines =
					args.lines !== undefined
						? expectPositiveInteger(args.lines, "lines")
						: 10;
				const absolute = resolveWithinFolder(ctx.folder.path, target);
				const stats = await fs.stat(absolute);
				if (!stats.isFile()) {
					throw new Error("Target is not a file.");
				}
				if (stats.size > MAX_READ_BYTES) {
					throw new Error("File exceeds 256KB read limit.");
				}
				data = await fs.readFile(absolute, "utf8");
			} catch (error) {
				return errorResult("tail", target, error);
			}

			// Split into lines and take last N lines
			const fileLines = data.split(/\r?\n/);
			const requestedLines = Math.min(lines, fileLines.length);
			const tailLines = fileLines.slice(-requestedLines);
			const preview = tailLines.join("\n");

			return successResult("tail", target, {
				lines: requestedLines,
				totalLines: fileLines.length,
				preview,
			});
		},
	};
}

function createFolderTool(): ToolHandler {
	return {
		definition: {
			type: "function",
			function: {
				name: "create_folder",
				description:
					"Create a new directory (folder) within the watched folder. Use this to organize files into subdirectories. Parent directories will be created automatically if they don't exist.",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description:
								"Relative path (within the watched folder) for the new directory to create, e.g., 'reports/2025' or 'documents/invoices'. The directory must not exist yet.",
						},
					},
					required: ["path"],
					additionalProperties: false,
				},
			},
		},
		async invoke(args, ctx) {
			const target = assertPathArgument(args.path, "path");

			if (ctx.dryRun) {
				ctx.logger.info(
					{ tool: "create_folder", target },
					"Dry run: create_folder skipped.",
				);
				return successResult("create_folder", target, {
					skipped: true,
					reason: "dry_run",
				});
			}

			try {
				const absolute = resolveWithinFolder(ctx.folder.path, target);
				await assertNotExists(absolute);
				await fs.mkdir(absolute, { recursive: true });
			} catch (error) {
				return errorResult("create_folder", target, error);
			}
			return successResult("create_folder", target, {});
		},
	};
}

function expectPositiveInteger(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		throw new Error(`${label} must be a positive integer.`);
	}
	return value;
}
