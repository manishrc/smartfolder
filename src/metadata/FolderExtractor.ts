import { FolderMetadata } from '../types/FileMetadata';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Folder metadata extractor
 * Analyzes folder contents recursively with depth limit
 */
export class FolderExtractor {
  private static readonly MAX_DEPTH = 10; // Prevent stack overflow on deep directories

  /**
   * Extract metadata from a folder
   *
   * @param folderPath - Absolute path to the folder
   * @param maxDepth - Maximum recursion depth (default: 10)
   * @returns Folder metadata
   */
  static async extract(
    folderPath: string,
    maxDepth: number = this.MAX_DEPTH
  ): Promise<FolderMetadata> {
    const metadata: FolderMetadata = {
      fileCount: 0,
      subfolderCount: 0,
      totalSize: 0,
      types: {},
    };

    await this.analyzeFolder(folderPath, metadata, 0, maxDepth);

    return metadata;
  }

  /**
   * Recursively analyze folder contents
   */
  private static async analyzeFolder(
    folderPath: string,
    metadata: FolderMetadata,
    currentDepth: number,
    maxDepth: number
  ): Promise<void> {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories (starting with .)
          if (entry.name.startsWith('.')) continue;

          metadata.subfolderCount++;

          // Only recurse if we haven't reached max depth
          if (currentDepth < maxDepth) {
            await this.analyzeFolder(entryPath, metadata, currentDepth + 1, maxDepth);
          }
        } else if (entry.isFile()) {
          metadata.fileCount++;

          // Get file stats
          const stats = await fs.stat(entryPath);
          metadata.totalSize += stats.size;

          // Track file types
          const ext = path.extname(entry.name).toLowerCase() || '(no extension)';
          metadata.types[ext] = (metadata.types[ext] || 0) + 1;
        }
      }
    } catch (error) {
      console.warn(`Folder analysis failed for ${folderPath}:`, error);
    }
  }
}
