import { readdir, readFile, lstat } from 'fs/promises';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { minimatch } from 'minimatch';
import { logger } from '../logger';

/**
 * Configuration extracted from a smartfolder.md file
 */
export interface SmartFolderMdConfig {
  /** Absolute path to the smartfolder.md file */
  filePath: string;
  /** Directory containing the smartfolder.md file (the "smart folder") */
  folderPath: string;
  /** Prompt text extracted from the file */
  prompt: string;
  /** Timestamp when config was last parsed */
  parsedAt: Date;
}

/**
 * Callbacks for discovery events
 */
export interface DiscoveryCallbacks {
  /** Called when a new smartfolder.md is discovered */
  onConfigAdded: (config: SmartFolderMdConfig) => void | Promise<void>;
  /** Called when a smartfolder.md is removed */
  onConfigRemoved: (
    filePath: string,
    folderPath: string
  ) => void | Promise<void>;
  /** Called when a smartfolder.md content changes */
  onConfigChanged: (config: SmartFolderMdConfig) => void | Promise<void>;
}

/**
 * Maximum file size for smartfolder.md files (1MB)
 * Prevents zip bomb attacks and excessive memory usage
 */
const MAX_SMARTFOLDER_MD_SIZE = 1024 * 1024; // 1MB

/**
 * Maximum prompt length in characters (security: prevent excessive prompts)
 */
const MAX_PROMPT_LENGTH = 50000; // 50K characters

/**
 * Discovers and monitors smartfolder.md files in root directories
 *
 * Strategy:
 * 1. Poll root directories at intervals to discover new/removed smartfolder.md files
 * 2. Watch discovered smartfolder.md files with Chokidar for instant content updates
 * 3. Notify via callbacks when configs are added/removed/changed
 */
export class SmartFolderMdDiscovery {
  private discoveredConfigs = new Map<string, SmartFolderMdConfig>();
  private pollInterval: NodeJS.Timeout | null = null;
  private fileWatchers = new Map<string, FSWatcher>();
  private isRunning = false;

  constructor(
    private rootPaths: string[],
    private callbacks: DiscoveryCallbacks,
    private pollIntervalMs: number = 5000,
    private ignorePatterns: string[] = [
      '**/node_modules/**',
      '**/.git/**',
      '**/.smartfolder/**',
    ]
  ) {
    // Resolve and normalize root paths
    this.rootPaths = rootPaths.map(p => path.resolve(p));
  }

  /**
   * Start the discovery system
   * - Performs initial discovery
   * - Starts polling loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('SmartFolderMdDiscovery already running');
      return;
    }

    this.isRunning = true;
    logger.info(
      `Starting SmartFolder discovery for roots: ${this.rootPaths.join(', ')}`
    );

    // Initial discovery
    await this.discoverAll();

    // Start polling loop
    this.pollInterval = setInterval(() => {
      this.discoverAll().catch(error => {
        logger.error('Discovery poll failed', { error });
      });
    }, this.pollIntervalMs);

    logger.info(`Discovery started (polling every ${this.pollIntervalMs}ms)`);
  }

  /**
   * Stop the discovery system
   * - Stops polling
   * - Closes all file watchers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('Stopping SmartFolder discovery');

    // Stop polling
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Close all file watchers
    const closePromises = Array.from(this.fileWatchers.values()).map(watcher =>
      watcher.close()
    );
    await Promise.all(closePromises);
    this.fileWatchers.clear();

    logger.info('Discovery stopped');
  }

  /**
   * Get all currently discovered configs
   */
  getDiscoveredConfigs(): SmartFolderMdConfig[] {
    return Array.from(this.discoveredConfigs.values());
  }

  /**
   * Perform a full discovery scan across all root paths
   */
  private async discoverAll(): Promise<void> {
    const foundFiles = new Set<string>();

    // Find all smartfolder.md files across root paths
    for (const rootPath of this.rootPaths) {
      try {
        const files = await this.findSmartfolderMdFiles(rootPath);
        files.forEach(f => foundFiles.add(f));
      } catch (error) {
        logger.error(`Failed to discover in root: ${rootPath}`, { error });
      }
    }

    // Detect newly added files
    const foundFilesArray = Array.from(foundFiles);
    for (const filePath of foundFilesArray) {
      if (!this.discoveredConfigs.has(filePath)) {
        await this.addConfig(filePath);
      }
    }

    // Detect removed files
    const configEntries = Array.from(this.discoveredConfigs.entries());
    for (const [filePath, config] of configEntries) {
      if (!foundFiles.has(filePath)) {
        await this.removeConfig(filePath, config.folderPath);
      }
    }
  }

  /**
   * Recursively find all smartfolder.md files in a directory
   */
  private async findSmartfolderMdFiles(rootPath: string): Promise<string[]> {
    const results: string[] = [];

    const searchDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          // Check against ignore patterns
          if (this.shouldIgnore(fullPath, rootPath)) {
            continue;
          }

          // Use lstat to avoid following symlinks (security: prevent symlink attacks)
          let stats;
          try {
            stats = await lstat(fullPath);
          } catch (statError) {
            const err = statError as any;
            if (err.code === 'ENOENT') {
              continue; // File disappeared, skip it
            }
            throw statError;
          }

          // Skip symlinks entirely
          if (stats.isSymbolicLink()) {
            logger.debug(`Skipping symlink: ${fullPath}`);
            continue;
          }

          if (stats.isFile() && entry.name.toLowerCase() === 'smartfolder.md') {
            results.push(fullPath);
          } else if (stats.isDirectory()) {
            // Recursively search subdirectories
            await searchDirectory(fullPath);
          }
        }
      } catch (error) {
        // Handle permission errors gracefully
        const err = error as any;
        if (err.code === 'EACCES' || err.code === 'EPERM') {
          logger.warn(`Permission denied accessing: ${dirPath}`);
        } else if (err.code === 'ENOENT') {
          // Directory was deleted during scan
          logger.debug(`Directory no longer exists: ${dirPath}`);
        } else {
          // Log but don't throw - continue with other directories
          logger.error(`Error scanning directory: ${dirPath}`, { error: err });
        }
      }
    };

    try {
      // Use lstat to avoid following symlinks at root level
      const rootStats = await lstat(rootPath);
      if (rootStats.isSymbolicLink()) {
        logger.warn(`Root path is a symlink, skipping: ${rootPath}`);
        return results;
      }
      await searchDirectory(rootPath);
    } catch (error) {
      const err = error as any;
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        logger.warn(`Permission denied accessing: ${rootPath}`);
      } else if (err.code === 'ENOENT') {
        logger.warn(`Root path does not exist: ${rootPath}`);
      } else {
        throw error;
      }
    }

    return results;
  }

  /**
   * Check if a file path should be ignored based on patterns
   */
  private shouldIgnore(filePath: string, rootPath: string): boolean {
    const relativePath = path.relative(rootPath, filePath);

    for (const pattern of this.ignorePatterns) {
      // Use minimatch for proper glob pattern matching
      // This supports **, *, {a,b}, [abc], and other glob features
      if (minimatch(relativePath, pattern, { dot: true })) {
        return true;
      }
    }

    return false;
  }

  /**
   * Add a newly discovered config
   */
  private async addConfig(filePath: string): Promise<void> {
    try {
      const config = await this.parseConfig(filePath);
      this.discoveredConfigs.set(filePath, config);

      // Start watching this file for changes
      this.watchConfigFile(filePath);

      logger.info(`Discovered smartfolder.md: ${filePath}`);

      // Notify callback
      await this.callbacks.onConfigAdded(config);
    } catch (error) {
      logger.error(`Failed to add config: ${filePath}`, { error });
    }
  }

  /**
   * Remove a config that no longer exists
   */
  private async removeConfig(
    filePath: string,
    folderPath: string
  ): Promise<void> {
    this.discoveredConfigs.delete(filePath);

    // Stop watching this file
    const watcher = this.fileWatchers.get(filePath);
    if (watcher) {
      await watcher.close();
      this.fileWatchers.delete(filePath);
    }

    logger.info(`Removed smartfolder.md: ${filePath}`);

    // Notify callback
    await this.callbacks.onConfigRemoved(filePath, folderPath);
  }

  /**
   * Watch a specific smartfolder.md file for changes
   */
  private watchConfigFile(filePath: string): void {
    // Don't create duplicate watchers
    if (this.fileWatchers.has(filePath)) {
      return;
    }

    const watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    watcher.on('change', async () => {
      try {
        const config = await this.parseConfig(filePath);
        this.discoveredConfigs.set(filePath, config);

        logger.info(`Updated smartfolder.md: ${filePath}`);

        // Notify callback
        await this.callbacks.onConfigChanged(config);
      } catch (error) {
        logger.error(`Failed to reload config: ${filePath}`, { error });
      }
    });

    watcher.on('unlink', async () => {
      const config = this.discoveredConfigs.get(filePath);
      if (config) {
        await this.removeConfig(filePath, config.folderPath);
      }
    });

    watcher.on('error', error => {
      logger.error(`Watcher error for ${filePath}`, { error });
    });

    this.fileWatchers.set(filePath, watcher);
  }

  /**
   * Parse a smartfolder.md file to extract configuration
   */
  private async parseConfig(filePath: string): Promise<SmartFolderMdConfig> {
    try {
      // Check file size before reading (security: prevent zip bombs)
      const stats = await lstat(filePath);
      if (stats.size > MAX_SMARTFOLDER_MD_SIZE) {
        throw new Error(
          `File too large: ${stats.size} bytes (max ${MAX_SMARTFOLDER_MD_SIZE} bytes)`
        );
      }

      const content = await readFile(filePath, 'utf-8');
      const folderPath = path.dirname(filePath);

      // For now, treat the entire file as the prompt
      // Future: Could support YAML frontmatter or JSON for additional config
      const prompt = content.trim();

      if (!prompt) {
        throw new Error('Empty smartfolder.md file');
      }

      // Security: Validate prompt length
      if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new Error(
          `Prompt too long: ${prompt.length} characters (max ${MAX_PROMPT_LENGTH})`
        );
      }

      // Security: Basic sanitization - warn about suspicious patterns
      this.validatePromptSafety(prompt, filePath);

      return {
        filePath: path.resolve(filePath),
        folderPath: path.resolve(folderPath),
        prompt,
        parsedAt: new Date(),
      };
    } catch (error) {
      const err = error as any;
      logger.error(`Failed to parse config: ${filePath}`, { error: err });
      throw new Error(`Invalid smartfolder.md at ${filePath}: ${err.message}`);
    }
  }

  /**
   * Validate prompt for potentially unsafe patterns
   * This is basic validation - not comprehensive security
   */
  private validatePromptSafety(prompt: string, filePath: string): void {
    // Check for excessive repetition (potential DoS)
    const sameCharRepeats = /(.)\1{1000,}/;
    if (sameCharRepeats.test(prompt)) {
      logger.warn(
        `Prompt contains excessive character repetition: ${filePath}`
      );
    }

    // Check for control characters (except newlines and tabs)
    const controlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/;
    if (controlChars.test(prompt)) {
      logger.warn(`Prompt contains unusual control characters: ${filePath}`);
    }

    // Check for null bytes (potential injection)
    if (prompt.includes('\0')) {
      throw new Error('Prompt contains null bytes');
    }
  }
}
