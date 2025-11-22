import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';

import { FolderConfig } from './config';
import { Logger } from './logger';

export interface WatchOptions {
  verbose?: boolean;
  logger: Logger;
  onFileAdded?: (
    folder: FolderConfig,
    filePath: string
  ) => void | Promise<void>;
}

interface FolderWatcher {
  folder: FolderConfig;
  watcher: FSWatcher;
  ready: Promise<void>;
}

export interface WatchSession {
  ready: Promise<void>;
  close: () => Promise<void>;
}

export function startFolderWatchers(
  folders: FolderConfig[],
  options: WatchOptions
): WatchSession {
  const watchers = folders.map(folder => createFolderWatcher(folder, options));
  const ready = Promise.all(watchers.map(entry => entry.ready)).then(
    () => undefined
  );
  const close = async () => {
    await Promise.all(
      watchers.map(async entry => {
        await entry.watcher.close();
      })
    );
  };

  return { ready, close };
}

function createFolderWatcher(
  folder: FolderConfig,
  options: WatchOptions
): FolderWatcher {
  const folderLogger = options.logger.child({ folder: folder.path });
  const watcher = chokidar.watch(folder.path, {
    persistent: true,
    ignoreInitial: true,
    ignored: folder.ignore.length > 0 ? folder.ignore : undefined,
    awaitWriteFinish: {
      stabilityThreshold: folder.debounceMs,
      pollInterval: Math.max(50, Math.min(folder.debounceMs / 2, 500)),
    },
    usePolling: typeof folder.pollIntervalMs === 'number',
    interval: folder.pollIntervalMs,
  });

  watcher.on('add', filePath => {
    const displayPath = formatDisplayPath(folder.path, filePath);
    folderLogger.info(
      { event: 'file_added', file: displayPath },
      'Detected new file'
    );
    if (options.onFileAdded) {
      Promise.resolve(options.onFileAdded(folder, filePath)).catch(error =>
        folderLogger.error(
          { err: (error as Error).message },
          'Error handling file event.'
        )
      );
    }
  });

  watcher.on('error', error => {
    folderLogger.error({ err: error }, 'Watcher error');
  });

  const ready = new Promise<void>(resolve => {
    watcher.once('ready', () => {
      if (options.verbose) {
        folderLogger.info(
          { event: 'watch_ready' },
          'Watcher ready (ignoring initial files).'
        );
      }
      resolve();
    });
  });

  return { folder, watcher, ready };
}

function formatDisplayPath(folderPath: string, filePath: string): string {
  const relative = path.relative(folderPath, filePath);
  if (!relative || relative.startsWith('..')) {
    return filePath;
  }
  return relative;
}
