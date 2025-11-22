import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';

/**
 * State directory utilities for managing centralized SmartFolder state
 *
 * Instead of polluting watched folders with `.smartfolder/` directories,
 * all state is stored in `~/.smartfolder/state/{folder-hash}/`
 */

/**
 * Get the SmartFolder home directory
 * Defaults to ~/.smartfolder unless SMARTFOLDER_HOME is set
 */
export function getSmartFolderHome(): string {
  return process.env.SMARTFOLDER_HOME
    ? path.resolve(process.env.SMARTFOLDER_HOME)
    : path.join(os.homedir(), '.smartfolder');
}

/**
 * Generate a stable hash for a folder path
 * This hash is used as the directory name for storing folder-specific state
 *
 * @param folderPath - Absolute path to the watched folder
 * @returns A stable hash string (first 16 chars of SHA-256)
 */
export function hashFolderPath(folderPath: string): string {
  // Normalize path to ensure consistent hashing across platforms
  const normalizedPath = path.normalize(path.resolve(folderPath));
  const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
  // Use first 16 characters for shorter directory names
  return hash.substring(0, 16);
}

/**
 * Get the centralized state directory for a watched folder
 *
 * @param folderPath - Absolute path to the watched folder
 * @returns Path to the state directory (e.g., ~/.smartfolder/state/abc123def456/)
 */
export function getStateDirForFolder(folderPath: string): string {
  const home = getSmartFolderHome();
  const hash = hashFolderPath(folderPath);
  return path.join(home, 'state', hash);
}

/**
 * Get the history log path for a watched folder
 *
 * @param folderPath - Absolute path to the watched folder
 * @returns Path to the history.jsonl file
 */
export function getHistoryLogPath(folderPath: string): string {
  return path.join(getStateDirForFolder(folderPath), 'history.jsonl');
}

/**
 * Get the metadata file path for a watched folder
 * This file stores information about the watched folder itself
 *
 * @param folderPath - Absolute path to the watched folder
 * @returns Path to the metadata.json file
 */
export function getMetadataPath(folderPath: string): string {
  return path.join(getStateDirForFolder(folderPath), 'metadata.json');
}

/**
 * Metadata stored for each watched folder
 */
export interface FolderStateMetadata {
  /** Original absolute path to the watched folder */
  folderPath: string;
  /** Hash used for the state directory */
  hash: string;
  /** When this folder was first watched */
  firstWatchedAt: string;
  /** Last time the watcher ran */
  lastRunAt?: string;
  /** Prompt used for this folder */
  prompt?: string;
}

/**
 * Create or update the metadata file for a watched folder
 *
 * @param folderPath - Absolute path to the watched folder
 * @param prompt - Optional prompt for the folder
 */
export async function ensureFolderMetadata(
  folderPath: string,
  prompt?: string
): Promise<void> {
  const fs = await import('fs/promises');
  const metadataPath = getMetadataPath(folderPath);
  const hash = hashFolderPath(folderPath);

  let metadata: FolderStateMetadata;

  try {
    // Try to read existing metadata
    const content = await fs.readFile(metadataPath, 'utf-8');
    metadata = JSON.parse(content);
    // Update lastRunAt and prompt
    metadata.lastRunAt = new Date().toISOString();
    if (prompt) {
      metadata.prompt = prompt;
    }
  } catch {
    // Create new metadata
    metadata = {
      folderPath: path.resolve(folderPath),
      hash,
      firstWatchedAt: new Date().toISOString(),
      lastRunAt: new Date().toISOString(),
      prompt,
    };
  }

  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}
