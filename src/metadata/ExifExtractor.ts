import { ExifMetadata } from '../types/FileMetadata';

/**
 * EXIF metadata extractor for images
 * Uses exifr library (optional peer dependency)
 */
export class ExifExtractor {
  /**
   * Extract EXIF metadata from an image file
   *
   * @param filePath - Absolute path to the image file
   * @returns EXIF metadata or undefined if extraction fails
   */
  static async extract(filePath: string): Promise<ExifMetadata | undefined> {
    try {
      // Try to import exifr (optional dependency)
      const exifr = await import('exifr').catch(() => null);
      if (!exifr) {
        console.warn(
          'exifr not installed, skipping EXIF extraction. Install with: npm install exifr'
        );
        return undefined;
      }

      // Extract relevant EXIF fields
      const data = await exifr.parse(filePath, {
        pick: [
          'Make',
          'Model',
          'DateTimeOriginal',
          'DateTime',
          'GPSLatitude',
          'GPSLongitude',
          'ImageWidth',
          'ImageHeight',
          'Orientation',
          'ISO',
          'FNumber',
          'ExposureTime',
          'FocalLength',
          'LensModel',
          'Software',
        ],
      });

      return data || undefined;
    } catch (error) {
      console.warn(`EXIF extraction failed for ${filePath}:`, error);
      return undefined;
    }
  }
}
