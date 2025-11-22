import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import {
  loadConfig,
  loadInlineConfig,
  SmartfolderConfig,
  SmartfolderConfigInput,
  FolderConfig,
  SUPPORTED_TOOL_IDS,
  ToolId,
} from './config';
import { startFolderWatchers, WatchSession } from './watcher';
import { logger } from './logger';
import { FileToolRegistry } from './tools/fileTools';
import { AiClient } from './workflow/aiClient';
import { WorkflowOrchestrator } from './workflow/orchestrator';
import { ensureFolderMetadata } from './utils/stateDir';

const VERSION = '0.1.0';
const SMARTFOLDER_HOME = process.env.SMARTFOLDER_HOME
  ? path.resolve(process.env.SMARTFOLDER_HOME)
  : os.homedir();
const GLOBAL_CONFIG_DIR = path.join(SMARTFOLDER_HOME, '.smartfolder');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'config.json');

class SmartfolderCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmartfolderCliError';
  }
}

type RunCommandOptions = {
  config?: string;
  dryRun?: boolean;
  runOnce?: boolean;
  verbose?: boolean;
};

type ValidateCommandOptions = {
  config?: string;
  dryRun?: boolean;
};

type InlineCommandOptions = {
  path: string;
  prompt?: string;
  dryRun?: boolean;
  runOnce?: boolean;
  verbose?: boolean;
};

type ParsedArgs =
  | { kind: 'run'; options: RunCommandOptions }
  | { kind: 'validate'; options: ValidateCommandOptions }
  | { kind: 'inline'; options: InlineCommandOptions };

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    return;
  }

  const parsed = parseArgs(args);

  if (parsed.kind === 'run') {
    await handleRunCommand(parsed.options);
  } else if (parsed.kind === 'validate') {
    const configPath = await resolveConfigPath('validate', parsed.options.config);
    const config = await loadConfig(configPath, { dryRun: Boolean(parsed.options.dryRun) });
    printConfigSummary(config);
    logger.info('Configuration looks good.');
  } else {
    await handleInlineRun(parsed.options);
  }
}

function parseArgs(args: string[]): ParsedArgs {
  if (args.length === 0) {
    throw new SmartfolderCliError('Provide a command (run | validate).');
  }

  const [first, ...rest] = args;
  if (first === 'run') {
    return { kind: 'run', options: parseRunOptions(rest) };
  }
  if (first === 'validate') {
    return { kind: 'validate', options: parseValidateOptions(rest) };
  }
  if (first.startsWith('-')) {
    throw new SmartfolderCliError('Provide a folder path before specifying options.');
  }
  return { kind: 'inline', options: parseInlineOptions(first, rest) };
}

function parseRunOptions(tokens: string[]): RunCommandOptions {
  const options: RunCommandOptions = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('-')) {
      throw new SmartfolderCliError(`Unexpected argument "${token}".`);
    }
    const { flag, inlineValue } = splitFlagToken(token);
    switch (flag) {
      case '--config':
      case '-c': {
        const { value, nextIndex } = consumeOptionValue(flag, inlineValue, tokens, i);
        options.config = value;
        i = nextIndex;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--run-once':
        options.runOnce = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      default:
        throw new SmartfolderCliError(`Unknown option "${flag}".`);
    }
  }
  return options;
}

function parseValidateOptions(tokens: string[]): ValidateCommandOptions {
  const options: ValidateCommandOptions = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('-')) {
      throw new SmartfolderCliError(`Unexpected argument "${token}".`);
    }
    const { flag, inlineValue } = splitFlagToken(token);
    switch (flag) {
      case '--config':
      case '-c': {
        const { value, nextIndex } = consumeOptionValue(flag, inlineValue, tokens, i);
        options.config = value;
        i = nextIndex;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new SmartfolderCliError(`Unknown option "${flag}".`);
    }
  }
  return options;
}

function parseInlineOptions(firstArg: string, tokens: string[]): InlineCommandOptions {
  const options: InlineCommandOptions = { path: firstArg };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('-')) {
      throw new SmartfolderCliError(`Unexpected argument "${token}".`);
    }
    const { flag, inlineValue } = splitFlagToken(token);
    switch (flag) {
      case '--prompt':
      case '-p': {
        const { value, nextIndex } = consumeOptionValue(flag, inlineValue, tokens, i);
        options.prompt = value;
        i = nextIndex;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--run-once':
        options.runOnce = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      default:
        throw new SmartfolderCliError(`Unknown option "${flag}".`);
    }
  }
  return options;
}

function splitFlagToken(token: string): { flag: string; inlineValue?: string } {
  if (token.startsWith('--')) {
    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      return { flag: token.slice(0, eqIndex), inlineValue: token.slice(eqIndex + 1) };
    }
  }
  return { flag: token };
}

function consumeOptionValue(
  flag: string,
  inlineValue: string | undefined,
  tokens: string[],
  currentIndex: number
): { value: string; nextIndex: number } {
  if (inlineValue !== undefined && inlineValue.length > 0) {
    return { value: inlineValue, nextIndex: currentIndex };
  }
  const nextToken = tokens[currentIndex + 1];
  if (!nextToken) {
    throw new SmartfolderCliError(`Option ${flag} requires a value.`);
  }
  return { value: nextToken, nextIndex: currentIndex + 1 };
}

async function handleRunCommand(options: RunCommandOptions): Promise<void> {
  const configPath = await resolveConfigPath('run', options.config);
  const dryRun = Boolean(options.dryRun);
  const runOnce = Boolean(options.runOnce);
  const verbose = Boolean(options.verbose);
  const config = await loadConfig(configPath, { dryRun });
  await startRunSession(config, { dryRun, runOnce, verbose });
}

async function handleInlineRun(options: InlineCommandOptions): Promise<void> {
  if (!options.path) {
    throw new SmartfolderCliError('Provide a folder path to watch.');
  }
  if (!options.prompt) {
    throw new SmartfolderCliError('Provide --prompt "..." when using the inline shortcut.');
  }

  const globalAi = await loadGlobalAiDefaults();
  const inlineAi = {
    provider: (globalAi?.provider as string) ?? 'vercel',
    model: (globalAi?.model as string) ?? 'openai/gpt-4o-mini',
    apiKey: (globalAi?.apiKey as string) ?? process.env.AI_GATEWAY_API_KEY,
    temperature: typeof globalAi?.temperature === 'number' ? globalAi?.temperature : 0.2,
    maxToolCalls: typeof globalAi?.maxToolCalls === 'number' ? globalAi?.maxToolCalls : 8,
    defaultTools: Array.isArray(globalAi?.defaultTools)
      ? (globalAi?.defaultTools as ToolId[])
      : [...SUPPORTED_TOOL_IDS],
  };

  const inlineConfig: SmartfolderConfigInput = {
    ai: inlineAi,
    folders: [
      {
        path: options.path,
        prompt: options.prompt,
        tools: inlineAi.defaultTools,
        ignore: [],
        env: {},
        dryRun: options.dryRun,
      },
    ],
  };

  const config = loadInlineConfig(inlineConfig, {
    dryRun: options.dryRun,
    sourcePath: path.join(process.cwd(), 'smartfolder.inline.config.json'),
  });

  await startRunSession(config, {
    dryRun: Boolean(options.dryRun),
    runOnce: Boolean(options.runOnce),
    verbose: Boolean(options.verbose),
  });
}

async function startRunSession(
  config: SmartfolderConfig,
  flags: { dryRun: boolean; runOnce: boolean; verbose: boolean }
): Promise<void> {
  printConfigSummary(config);

  const aiApiKey = resolveAiApiKey(config);
  if (!aiApiKey) {
    logger.warn('No AI API key detected. Set AI_GATEWAY_API_KEY or ai.apiKey before running workflows.');
  } else {
    logger.info({ apiKey: maskSecret(aiApiKey) }, 'AI API key detected.');
  }

  if (flags.runOnce) {
    logger.info('`--run-once` requested. The watcher will exit after the first scan when implemented.');
  }

  if (flags.verbose) {
    logger.info('Verbose logging enabled.');
  }

  await ensureStateDirectories(config.folders);

  const toolRegistry = new FileToolRegistry();
  const aiClient = new AiClient({
    apiKey: aiApiKey,
    model: config.ai.model,
    temperature: config.ai.temperature,
    logger: logger.child({ scope: 'ai' }),
  });
  const orchestrator = new WorkflowOrchestrator(
    aiClient,
    toolRegistry,
    logger.child({ scope: 'workflow' }),
    config.ai.maxToolCalls
  );

  logger.info('Starting watchers (Chokidar) for new file events...');
  const watchLogger = logger.child({ scope: 'watchers' });
  const watchSession = startFolderWatchers(config.folders, {
    verbose: flags.verbose,
    logger: watchLogger,
    onFileAdded: (folder, filePath) => orchestrator.enqueueFile(folder, filePath, flags.dryRun),
  });
  await watchSession.ready;
  logger.info({ folders: config.folders.length }, 'Watching folders for new files.');

  if (flags.runOnce) {
    await watchSession.close();
    logger.info('Run-once mode complete. Exiting.');
    return;
  }

  logger.info('AI workflows active. Press Ctrl+C to stop.');
  await holdProcessOpen(watchSession);
}

function printConfigSummary(config: SmartfolderConfig): void {
  logger.info(
    {
      configPath: config.sourcePath,
      provider: config.ai.provider,
      model: config.ai.model,
      defaultTools: config.ai.defaultTools,
      folderCount: config.folders.length,
    },
    'Loaded smartfolder config.'
  );
  config.folders.forEach((folder, index) => {
    logFolderSummary(folder, index);
  });
}

function logFolderSummary(folder: FolderConfig, index: number): void {
  logger.info(
    {
      index: index + 1,
      folder: folder.path,
      promptPreview: preview(folder.prompt),
      tools: folder.tools,
      ignore: folder.ignore,
      debounceMs: folder.debounceMs,
      dryRun: folder.dryRun,
      envKeys: Object.keys(folder.env).length,
    },
    'Configured folder.'
  );
}

function preview(text: string, length = 72): string {
  if (text.length <= length) {
    return text;
  }
  return `${text.slice(0, length - 3)}...`;
}

function maskSecret(secret: string): string {
  if (secret.length <= 4) {
    return '****';
  }
  return `${secret.slice(0, 2)}***${secret.slice(-2)}`;
}

function resolveAiApiKey(config: SmartfolderConfig): string | undefined {
  return (
    config.ai.apiKey ||
    process.env.AI_GATEWAY_API_KEY
  );
}

async function ensureStateDirectories(folders: FolderConfig[]): Promise<void> {
  await Promise.all(
    folders.map(async (folder) => {
      try {
        // Create state directory in ~/.smartfolder/state/{folder-hash}/
        await fs.mkdir(folder.stateDir, { recursive: true });
        // Create/update metadata file to track watched folders
        await ensureFolderMetadata(folder.path, folder.prompt);
      } catch (error) {
        logger.warn(
          { folder: folder.path, err: (error as Error).message },
          'Unable to prepare centralized state directory.'
        );
      }
    })
  );
}

async function holdProcessOpen(watchSession: WatchSession): Promise<void> {
  await new Promise<void>((resolve) => {
    const handleSignal = async (signal: NodeJS.Signals) => {
      logger.info({ signal }, 'Received shutdown signal.');
      cleanup();
      await watchSession.close();
      resolve();
    };
    const cleanup = () => {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
    };
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);
  });
}

async function resolveConfigPath(commandName: string, provided?: string): Promise<string> {
  if (provided) {
    return provided;
  }
  const globalPath = await findGlobalConfigPath();
  if (globalPath) {
    logger.info({ globalConfig: globalPath }, 'Using global config.');
    return globalPath;
  }
  throw new SmartfolderCliError(
    `Missing --config <path> option for '${commandName}'. Create ${GLOBAL_CONFIG_PATH} or pass --config explicitly.`
  );
}

async function findGlobalConfigPath(): Promise<string | undefined> {
  try {
    await fs.access(GLOBAL_CONFIG_PATH);
    return GLOBAL_CONFIG_PATH;
  } catch {
    return undefined;
  }
}

type AiConfigInput = {
  provider?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxToolCalls?: number;
  defaultTools?: ToolId[];
};

async function loadGlobalAiDefaults(): Promise<AiConfigInput | undefined> {
  const globalPath = await findGlobalConfigPath();
  if (!globalPath) {
    return undefined;
  }
  try {
    const raw = await fs.readFile(globalPath, 'utf8');
    const parsed = JSON.parse(raw) as SmartfolderConfigInput;
    if (parsed && typeof parsed === 'object' && parsed.ai && typeof parsed.ai === 'object') {
      return parsed.ai as AiConfigInput;
    }
  } catch (error) {
    logger.warn(
      { err: (error as Error).message, globalConfig: globalPath },
      'Unable to read global config. Skipping defaults.'
    );
  }
  return undefined;
}

function printHelp(): void {
  console.log(`smartfolder v${VERSION}`);
  console.log('Usage: smartfolder <command> [options]\n');
  console.log('Commands:');
  console.log('  run        Start watchers and invoke workflows (stub).');
  console.log('  validate   Validate the config file without starting watchers.\n');
  console.log('Options:');
  console.log('  -c, --config <path>   Path to smartfolder config (JSON).');
  console.log('      --dry-run         Simulate tool side effects.');
  console.log('      --run-once        Exit after the first pass.');
  console.log('      --verbose         Enable verbose logging.');
  console.log('  -h, --help            Show this help message.');
  console.log('  -v, --version         Show CLI version.');
  console.log('\nShortcuts:');
  console.log('  smartfolder ./path --prompt "..." [--dry-run] [--run-once] [--verbose]');
  console.log('    Uses inline config plus ~/.smartfolder/config.json defaults if present.');
}

export { loadConfig, FolderConfig, SmartfolderConfig, ToolId, SUPPORTED_TOOL_IDS };
