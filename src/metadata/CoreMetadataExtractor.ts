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
   * Calculate SHA-256 hash of a file using streaming
   * Uses Node.js native crypto with streaming to avoid loading entire file into memory
   * This is critical for large files (e.g., 4GB videos) to prevent OOM errors
   *
   * @param filePath - Absolute path to the file
   * @returns SHA-256 hash as hex string
   */
  private static async calculateHash(filePath: string): Promise<string> {
    const { createReadStream } = await import('fs');
    const hash = crypto.createHash('sha256');

    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath);

      stream.on('data', (chunk: string | Buffer) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (err: Error) => {
        reject(err);
      });
    });
  }
}
