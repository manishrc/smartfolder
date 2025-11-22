import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { CoreMetadata } from '../types/FileMetadata';
import { FileCategory } from '../types/FileCategory';

/**
 * Core metadata extractor
 * Extracts file system metadata and calculates hash
 */
export class CoreMetadataExtractor {
  /**
   * Extract core metadata from a file
   *
   * @param filePath - Absolute path to the file
   * @param watchedFolder - Root folder being watched
   * @param category - File category
   * @returns Core file metadata
   */
  static async extract(
    filePath: string,
    watchedFolder: string,
    category: FileCategory
  ): Promise<CoreMetadata> {
    const stats = await fs.stat(filePath);
    const hash = await this.calculateHash(filePath);

    return {
      path: filePath,
      relativePath: path.relative(watchedFolder, filePath),
      fileName: path.basename(filePath),
      extension: path.extname(filePath),
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      category,
      hash: {
        algorithm: 'sha256',
        value: hash,
      },
    };
  }

  /**
   * Calculate SHA-256 hash of a file
   * Used for deduplication and integrity checks
   *
   * @param filePath - Absolute path to the file
   * @returns SHA-256 hash as hex string
   */
  private static async calculateHash(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
