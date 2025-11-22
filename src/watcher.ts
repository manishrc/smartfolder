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
    depth: 0, // Only watch the immediate directory, not subdirectories
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

/**
 * Dynamic watcher manager for adding/removing folder watchers on-the-fly
 * Used in discovery mode when smartfolder.md files are added/removed
 */
export class DynamicWatcherManager {
  private watchers = new Map<string, FolderWatcher>();

  constructor(private options: WatchOptions) {}

  /**
   * Add a new folder watcher
   * @param folder - Folder configuration to watch
   * @returns Promise that resolves when watcher is ready
   */
  async addWatcher(folder: FolderConfig): Promise<void> {
    const folderPath = folder.path;

    // Don't create duplicate watchers
    if (this.watchers.has(folderPath)) {
      this.options.logger.warn(
        { folder: folderPath },
        'Watcher already exists for folder'
      );
      return;
    }

    const folderWatcher = createFolderWatcher(folder, this.options);
    this.watchers.set(folderPath, folderWatcher);

    // Wait for watcher to be ready
    await folderWatcher.ready;

    this.options.logger.info(
      { folder: folderPath },
      'Added dynamic watcher for folder'
    );
  }

  /**
   * Remove a folder watcher
   * @param folderPath - Absolute path to the folder
   */
  async removeWatcher(folderPath: string): Promise<void> {
    const folderWatcher = this.watchers.get(folderPath);

    if (!folderWatcher) {
      this.options.logger.warn(
        { folder: folderPath },
        'No watcher found for folder'
      );
      return;
    }

    await folderWatcher.watcher.close();
    this.watchers.delete(folderPath);

    this.options.logger.info(
      { folder: folderPath },
      'Removed dynamic watcher for folder'
    );
  }

  /**
   * Update the prompt for an existing watcher
   * Note: This updates the folder config in memory
   * @param folderPath - Absolute path to the folder
   * @param newPrompt - Updated prompt text
   */
  updatePrompt(folderPath: string, newPrompt: string): void {
    const folderWatcher = this.watchers.get(folderPath);

    if (!folderWatcher) {
      this.options.logger.warn(
        { folder: folderPath },
        'No watcher found for folder to update prompt'
      );
      return;
    }

    // Update the prompt in the folder config
    folderWatcher.folder.prompt = newPrompt;

    this.options.logger.info(
      { folder: folderPath },
      'Updated prompt for folder'
    );
  }

  /**
   * Get all currently watched folders
   */
  getWatchedFolders(): FolderConfig[] {
    return Array.from(this.watchers.values()).map(fw => fw.folder);
  }

  /**
   * Check if a folder is being watched
   */
  isWatching(folderPath: string): boolean {
    return this.watchers.has(folderPath);
  }

  /**
   * Close all watchers
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.watchers.values()).map(fw =>
      fw.watcher.close()
    );
    await Promise.all(closePromises);
    this.watchers.clear();

    this.options.logger.info('Closed all dynamic watchers');
  }
}
