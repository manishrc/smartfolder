import { ArchiveMetadata } from '../types/FileMetadata';
import * as path from 'path';

/**
 * Archive metadata extractor
 * Uses node-stream-zip library (optional peer dependency)
 */
export class ArchiveExtractor {
  /**
   * Extract metadata from an archive file
   *
   * @param filePath - Absolute path to the archive file
   * @returns Archive metadata or undefined if extraction fails
   */
  static async extract(filePath: string): Promise<ArchiveMetadata | undefined> {
    const ext = path.extname(filePath).toLowerCase();

    // Determine archive type
    let type: ArchiveMetadata['type'];
    if (ext === '.zip') type = 'zip';
    else if (ext === '.tar') type = 'tar';
    else if (ext === '.gz' || ext === '.tgz') type = 'gz';
    else if (ext === '.rar') type = 'rar';
    else if (ext === '.7z') type = '7z';
    else return undefined;

    // Currently only support ZIP files
    if (type === 'zip') {
      return this.extractZipMetadata(filePath, type);
    }

    // For other archive types, return basic metadata
    return { type };
  }

  /**
   * Extract metadata from a ZIP file
   */
  private static async extractZipMetadata(
    filePath: string,
    type: ArchiveMetadata['type']
  ): Promise<ArchiveMetadata | undefined> {
    try {
      // Try to import node-stream-zip (optional dependency)
      const StreamZip = await import('node-stream-zip').catch(() => null);
      if (!StreamZip) {
        console.warn(
          'node-stream-zip not installed, skipping archive metadata extraction. Install with: npm install node-stream-zip'
        );
        return { type };
      }

      // Create a readable stream from the ZIP
      const zip = new StreamZip.default.async({ file: filePath });

      try {
        const entries = await zip.entries();
        const entryArray = Object.values(entries);

        const files = entryArray
          .filter((entry: any) => !entry.isDirectory)
          .map((entry: any) => ({
            name: entry.name,
            size: entry.size,
            compressed: entry.compressedSize < entry.size,
          }));

        const uncompressedSize = files.reduce(
          (sum, file) => sum + file.size,
          0
        );

        await zip.close();

        return {
          type,
          fileCount: files.length,
          uncompressedSize,
          files: files.slice(0, 100), // Limit to first 100 files
        };
      } catch (error) {
        await zip.close();
        throw error;
      }
    } catch (error) {
      console.warn(
        `Archive metadata extraction failed for ${filePath}:`,
        error
      );
      return { type };
    }
  }
}
