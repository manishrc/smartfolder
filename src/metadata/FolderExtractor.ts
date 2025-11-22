import { FolderMetadata } from '../types/FileMetadata';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Folder metadata extractor
 * Analyzes folder contents recursively
 */
export class FolderExtractor {
  /**
   * Extract metadata from a folder
   *
   * @param folderPath - Absolute path to the folder
   * @returns Folder metadata
   */
  static async extract(folderPath: string): Promise<FolderMetadata> {
    const metadata: FolderMetadata = {
      fileCount: 0,
      subfolderCount: 0,
      totalSize: 0,
      types: {},
    };

    await this.analyzeFolder(folderPath, metadata);

    return metadata;
  }

  /**
   * Recursively analyze folder contents
   */
  private static async analyzeFolder(
    folderPath: string,
    metadata: FolderMetadata
  ): Promise<void> {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          // Skip .smartfolder and hidden directories
          if (entry.name.startsWith('.')) continue;

          metadata.subfolderCount++;
          // Recursively analyze subdirectories
          await this.analyzeFolder(entryPath, metadata);
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
