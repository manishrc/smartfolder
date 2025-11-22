import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getStateDirForFolder, getHistoryLogPath } from './utils/stateDir';

export const SUPPORTED_TOOL_IDS = [
  'read_file',
  'write_file',
  'rename_file',
  'move_file',
  'grep',
  'sed',
  'head',
  'tail',
  'create_folder',
] as const;

export type ToolId = typeof SUPPORTED_TOOL_IDS[number];

const envVariablePattern = /^\$\{?([A-Z0-9_]+)\}?$/i;
const DEFAULT_DEBOUNCE_MS = 1500;
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOOL_CALLS = 8;
// No longer need to ignore .smartfolder - state is centralized in ~/.smartfolder/state/
const INTERNAL_IGNORE_PATTERNS: string[] = [];

/**
 * Whitelist of allowed environment variables (security: prevent arbitrary env var access)
 * Only these environment variables can be referenced in config files
 */
const ALLOWED_ENV_VARS = new Set([
  // AI/LLM API Keys
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'COHERE_API_KEY',
  'GOOGLE_API_KEY',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',

  // SmartFolder specific
  'SMARTFOLDER_HOME',
  'SMARTFOLDER_API_KEY',

  // Standard safe variables
  'HOME',
  'USER',
  'PATH',
  'SHELL',
  'LANG',
  'LC_ALL',
  'TZ',

  // Testing
  'TEST_SMARTFOLDER_KEY',
  'TEST_FOLDER_SECRET',
]);

interface RawRootConfig {
  ai?: unknown;
  folders?: unknown;
  rootDirectories?: unknown;
  // Global settings that apply to all discovered folders
  tools?: unknown;
  ignore?: unknown;
  debounceMs?: unknown;
  pollIntervalMs?: unknown;
  discoveryIntervalMs?: unknown;
  env?: unknown;
  dryRun?: unknown;
}

export type SmartfolderConfigInput = RawRootConfig;

interface NormalizeFolderContext {
  aiDefaultTools: ToolId[];
  sourceDir: string;
  dryRunOverride?: boolean;
}

export interface SmartfolderConfig {
  sourcePath: string;
  sourceDir: string;
  ai: {
    provider: 'vercel';
    model: string;
    apiKey?: string;
    temperature: number;
    maxToolCalls: number;
    defaultTools: ToolId[];
  };
  folders: FolderConfig[];
  // New: root directories for discovery mode
  rootDirectories?: string[];
  globalDefaults?: {
    tools: ToolId[];
    ignore: string[];
    debounceMs: number;
    pollIntervalMs?: number;
    discoveryIntervalMs: number;
    env: Record<string, string>;
    dryRun: boolean;
  };
}

export interface FolderConfig {
  path: string;
  prompt: string;
  tools: ToolId[];
  ignore: string[];
  debounceMs: number;
  pollIntervalMs?: number;
  env: Record<string, string>;
  dryRun: boolean;
  stateDir: string;
  historyLogPath: string;
}

export interface LoadConfigOptions {
  dryRun?: boolean;
}

export class SmartfolderConfigError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'SmartfolderConfigError';
  }
}

export async function loadConfig(
  providedPath: string,
  options: LoadConfigOptions = {}
): Promise<SmartfolderConfig> {
  const absolutePath = path.resolve(providedPath);
  let fileContents: string;
  try {
    fileContents = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new SmartfolderConfigError(
      `Unable to read config at ${absolutePath}: ${(error as Error).message}`,
      error
    );
  }

  if (!fileContents.trim()) {
    throw new SmartfolderConfigError('Config file is empty.');
  }

  const parsed = parseConfigFile(fileContents, absolutePath);

  return normalizeConfig(parsed, absolutePath, options);
}

export function loadInlineConfig(
  config: SmartfolderConfigInput,
  options: LoadConfigOptions & { sourcePath?: string } = {}
): SmartfolderConfig {
  const sourcePath =
    options.sourcePath ??
    path.join(process.cwd(), 'smartfolder.inline.config.json');
  return normalizeConfig(config, sourcePath, options);
}

function parseConfigFile(contents: string, filename: string): unknown {
  const ext = path.extname(filename).toLowerCase();
  if (ext && ext !== '.json') {
    throw new SmartfolderConfigError(
      `Unsupported config extension "${ext}". Use JSON for now.`
    );
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new SmartfolderConfigError(
      `Unable to parse config file ${filename} as JSON.`,
      error
    );
  }
}

function normalizeConfig(
  rawConfig: unknown,
  sourcePath: string,
  options: LoadConfigOptions
): SmartfolderConfig {
  if (!isPlainObject(rawConfig)) {
    throw new SmartfolderConfigError('Config root must be an object.');
  }

  const typedRoot = rawConfig as RawRootConfig;
  const sourceDir = path.dirname(sourcePath);
  const ai = normalizeAiConfig(typedRoot.ai);

  // Check if using new rootDirectories mode or legacy folders mode
  const usingRootDirectories = typedRoot.rootDirectories !== undefined;
  const usingFolders = typedRoot.folders !== undefined;

  if (usingRootDirectories && usingFolders) {
    throw new SmartfolderConfigError(
      'Cannot use both `rootDirectories` and `folders` in the same config. Choose one approach.'
    );
  }

  let folders: FolderConfig[] = [];
  let rootDirectories: string[] | undefined;
  let globalDefaults: SmartfolderConfig['globalDefaults'] | undefined;

  if (usingRootDirectories) {
    // New discovery mode
    rootDirectories = normalizeRootDirectories(typedRoot.rootDirectories, sourceDir);
    globalDefaults = normalizeGlobalDefaults(typedRoot, ai.defaultTools, options.dryRun);
  } else {
    // Legacy folders mode
    if (!Array.isArray(typedRoot.folders) || typedRoot.folders.length === 0) {
      throw new SmartfolderConfigError(
        'Provide either `rootDirectories` (for discovery mode) or `folders` (for static mode).'
      );
    }

    folders = typedRoot.folders.map((folder, index) =>
      normalizeFolderConfig(folder, index, {
        aiDefaultTools: ai.defaultTools,
        sourceDir,
        dryRunOverride: options.dryRun,
      })
    );
  }

  return {
    sourcePath,
    sourceDir,
    ai,
    folders,
    rootDirectories,
    globalDefaults,
  };
}

function normalizeRootDirectories(value: unknown, sourceDir: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SmartfolderConfigError(
      '`rootDirectories` must be an array with at least one path.'
    );
  }

  return value.map((entry, index) => {
    const pathStr = expectString(entry, `rootDirectories[${index}]`);
    return resolvePath(pathStr, sourceDir);
  });
}

function normalizeGlobalDefaults(
  rawConfig: RawRootConfig,
  aiDefaultTools: ToolId[],
  dryRunOverride?: boolean
): SmartfolderConfig['globalDefaults'] {
  const DEFAULT_DISCOVERY_INTERVAL_MS = 5000;

  const tools = rawConfig.tools
    ? dedupeTools(validateToolList(rawConfig.tools, 'tools'))
    : aiDefaultTools;

  const ignore = dedupeStrings([
    ...INTERNAL_IGNORE_PATTERNS,
    ...(rawConfig.ignore
      ? validateStringArray(rawConfig.ignore, 'ignore')
      : []),
  ]);

  const env = rawConfig.env ? validateEnvRecord(rawConfig.env, 'env') : {};

  const debounceMs =
    rawConfig.debounceMs === undefined
      ? DEFAULT_DEBOUNCE_MS
      : expectNonNegativeInteger(rawConfig.debounceMs, 'debounceMs');

  const pollIntervalMs =
    rawConfig.pollIntervalMs === undefined
      ? undefined
      : expectPositiveInteger(rawConfig.pollIntervalMs, 'pollIntervalMs');

  const discoveryIntervalMs =
    rawConfig.discoveryIntervalMs === undefined
      ? DEFAULT_DISCOVERY_INTERVAL_MS
      : expectPositiveInteger(rawConfig.discoveryIntervalMs, 'discoveryIntervalMs');

  const dryRun =
    dryRunOverride ??
    expectOptionalBoolean(rawConfig.dryRun, 'dryRun') ??
    false;

  return {
    tools: dedupeTools(tools),
    ignore,
    debounceMs,
    pollIntervalMs,
    discoveryIntervalMs,
    env,
    dryRun,
  };
}

function normalizeAiConfig(rawAi: unknown): SmartfolderConfig['ai'] {
  if (rawAi !== undefined && !isPlainObject(rawAi)) {
    throw new SmartfolderConfigError('`ai` must be an object.');
  }

  const ai = (rawAi ?? {}) as Record<string, unknown>;

  const provider = ai.provider ?? 'vercel';
  if (provider !== 'vercel') {
    throw new SmartfolderConfigError(
      'Only the `vercel` AI provider is supported right now.'
    );
  }

  const model =
    ai.model === undefined ? DEFAULT_MODEL : expectString(ai.model, 'ai.model');
  const apiKey = resolveEnvValue(
    expectOptionalString(ai.apiKey, 'ai.apiKey'),
    'ai.apiKey',
    true
  );

  const temperature =
    ai.temperature === undefined
      ? DEFAULT_TEMPERATURE
      : expectNumberInRange(ai.temperature, 'ai.temperature', 0, 2);

  const maxToolCalls =
    ai.maxToolCalls === undefined
      ? DEFAULT_MAX_TOOL_CALLS
      : expectPositiveInteger(ai.maxToolCalls, 'ai.maxToolCalls');

  const defaultTools = ai.defaultTools
    ? dedupeTools(validateToolList(ai.defaultTools, 'ai.defaultTools'))
    : [...SUPPORTED_TOOL_IDS];

  return {
    provider: 'vercel',
    model,
    apiKey,
    temperature,
    maxToolCalls,
    defaultTools,
  };
}

function normalizeFolderConfig(
  rawFolder: unknown,
  index: number,
  ctx: NormalizeFolderContext
): FolderConfig {
  if (!isPlainObject(rawFolder)) {
    throw new SmartfolderConfigError(`folders[${index}] must be an object.`);
  }

  const folder = rawFolder as Record<string, unknown>;
  const label = (field: string) => `folders[${index}].${field}`;

  const folderPath = resolvePath(
    expectString(folder.path, label('path')),
    ctx.sourceDir
  );
  const prompt = expectString(folder.prompt, label('prompt'));
  // Use centralized state directory in ~/.smartfolder/state/{folder-hash}/
  const stateDir = getStateDirForFolder(folderPath);
  const historyLogPath = getHistoryLogPath(folderPath);

  const tools = folder.tools
    ? validateToolList(folder.tools, label('tools'))
    : ctx.aiDefaultTools;

  const ignore = dedupeStrings([
    ...INTERNAL_IGNORE_PATTERNS,
    ...(folder.ignore
      ? validateStringArray(folder.ignore, label('ignore'))
      : []),
  ]);
  const env = folder.env ? validateEnvRecord(folder.env, label('env')) : {};

  const debounceMs =
    folder.debounceMs === undefined
      ? DEFAULT_DEBOUNCE_MS
      : expectNonNegativeInteger(folder.debounceMs, label('debounceMs'));

  const pollIntervalMs =
    folder.pollIntervalMs === undefined
      ? undefined
      : expectPositiveInteger(folder.pollIntervalMs, label('pollIntervalMs'));

  const dryRunFlag =
    ctx.dryRunOverride ??
    expectOptionalBoolean(folder.dryRun, label('dryRun')) ??
    false;

  return {
    path: folderPath,
    prompt,
    tools: dedupeTools(tools),
    ignore,
    debounceMs,
    pollIntervalMs,
    env,
    dryRun: dryRunFlag,
    stateDir,
    historyLogPath,
  };
}

function validateToolList(value: unknown, label: string): ToolId[] {
  if (!Array.isArray(value)) {
    throw new SmartfolderConfigError(`${label} must be an array of tool ids.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new SmartfolderConfigError(`${label}[${index}] must be a string.`);
    }
    if (!SUPPORTED_TOOL_IDS.includes(entry as ToolId)) {
      throw new SmartfolderConfigError(
        `${label}[${index}] must be one of: ${SUPPORTED_TOOL_IDS.join(', ')}.`
      );
    }
    return entry as ToolId;
  });
}

function validateStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new SmartfolderConfigError(`${label} must be an array of strings.`);
  }
  return value.map((entry, index) =>
    expectString(entry, `${label}[${index}]`, { allowEmpty: false })
  );
}

function validateEnvRecord(
  value: unknown,
  label: string
): Record<string, string> {
  if (!isPlainObject(value)) {
    throw new SmartfolderConfigError(
      `${label} must be an object containing string values.`
    );
  }

  const env: Record<string, string> = {};
  Object.entries(value).forEach(([key, rawValue]) => {
    const rawString = expectString(rawValue, `${label}.${key}`);
    const resolved = resolveEnvValue(rawString, `${label}.${key}`, false);
    env[key] = resolved ?? rawString;
  });
  return env;
}

function expectString(
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean } = {}
): string {
  if (typeof value !== 'string') {
    throw new SmartfolderConfigError(`${label} must be a string.`);
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    throw new SmartfolderConfigError(`${label} cannot be empty.`);
  }
  return value;
}

function expectOptionalString(
  value: unknown,
  label: string
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectString(value, label);
}

function expectOptionalBoolean(
  value: unknown,
  label: string
): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new SmartfolderConfigError(`${label} must be a boolean.`);
  }
  return value;
}

function expectNumberInRange(
  value: unknown,
  label: string,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new SmartfolderConfigError(`${label} must be a number.`);
  }
  if (value < min || value > max) {
    throw new SmartfolderConfigError(
      `${label} must be between ${min} and ${max}.`
    );
  }
  return value;
}

function expectPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new SmartfolderConfigError(`${label} must be a positive integer.`);
  }
  return value as number;
}

function expectNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new SmartfolderConfigError(
      `${label} must be a non-negative integer.`
    );
  }
  return value as number;
}

function resolveEnvValue(
  value: string | undefined,
  label: string,
  throwIfMissing: boolean
): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(envVariablePattern);
  if (!match) {
    return value;
  }

  const envKey = match[1];

  // Security: Enforce environment variable whitelist
  if (!ALLOWED_ENV_VARS.has(envKey)) {
    throw new SmartfolderConfigError(
      `Environment variable ${envKey} referenced by ${label} is not allowed. ` +
      `Allowed variables: ${Array.from(ALLOWED_ENV_VARS).join(', ')}`
    );
  }

  const resolved = process.env[envKey];

  if (!resolved) {
    if (throwIfMissing) {
      throw new SmartfolderConfigError(
        `Environment variable ${envKey} referenced by ${label} is not set.`
      );
    }
    return undefined;
  }

  return resolved;
}

function resolvePath(targetPath: string, baseDir: string): string {
  // Expand tilde (~) to home directory
  let expandedPath = targetPath;
  if (targetPath.startsWith('~/') || targetPath === '~') {
    expandedPath = targetPath.replace(/^~/, os.homedir());
  }

  const candidate = path.isAbsolute(expandedPath)
    ? expandedPath
    : path.resolve(baseDir, expandedPath);
  return path.normalize(candidate);
}

function dedupeTools(tools: ToolId[]): ToolId[] {
  return Array.from(new Set(tools));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function dedupeStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}

/**
 * Create a FolderConfig from a discovered smartfolder.md
 * Used in discovery mode to create folder configs dynamically
 */
export function createFolderConfigFromDiscovery(
  folderPath: string,
  prompt: string,
  globalDefaults: NonNullable<SmartfolderConfig['globalDefaults']>
): FolderConfig {
  const stateDir = getStateDirForFolder(folderPath);
  const historyLogPath = getHistoryLogPath(folderPath);

  return {
    path: folderPath,
    prompt,
    tools: globalDefaults.tools,
    ignore: globalDefaults.ignore,
    debounceMs: globalDefaults.debounceMs,
    pollIntervalMs: globalDefaults.pollIntervalMs,
    env: globalDefaults.env,
    dryRun: globalDefaults.dryRun,
    stateDir,
    historyLogPath,
  };
}
