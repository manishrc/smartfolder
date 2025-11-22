import pino from 'pino';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const validLevels: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
];

function resolveLogLevel(value?: string): LogLevel {
  if (!value) {
    return 'info';
  }
  return validLevels.includes(value as LogLevel) ? (value as LogLevel) : 'info';
}

export interface Logger {
  fatal: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  child: (bindings?: Record<string, unknown>) => Logger;
}

// Check if we're running in a TTY (terminal) and if JSON output is explicitly requested
const isTTY = process.stdout.isTTY;
const useJsonOutput = process.env.SMARTFOLDER_LOG_JSON === 'true';

// Configure pino transport for pretty output in CLI mode
// Use pino-pretty if available and running in TTY, otherwise use JSON
let pinoConfig: {
  level?: string;
  base?: Record<string, unknown>;
  transport?: {
    target: string;
    options?: Record<string, unknown>;
  };
};

if (isTTY && !useJsonOutput) {
  try {
    // Try to use pino-pretty if available (install with: npm install -D pino-pretty)
    require('pino-pretty');
    // Use pino-pretty via transport option (recommended approach)
    pinoConfig = {
      level: resolveLogLevel(process.env.SMARTFOLDER_LOG_LEVEL),
      base: { app: 'smartfolder' },
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname,app',
          singleLine: false,
          messageFormat: '{msg}',
        },
      },
    };
  } catch {
    // pino-pretty not available, will use JSON output
    pinoConfig = {
      level: resolveLogLevel(process.env.SMARTFOLDER_LOG_LEVEL),
      base: { app: 'smartfolder' },
    };
  }
} else {
  pinoConfig = {
    level: resolveLogLevel(process.env.SMARTFOLDER_LOG_LEVEL),
    base: { app: 'smartfolder' },
  };
}

// TypeScript doesn't always recognize pino as callable with esModuleInterop
// Using type assertion to work around this - pino is callable at runtime
const baseLogger = (pino as any)(pinoConfig);

export const logger = (baseLogger as unknown) as Logger;
