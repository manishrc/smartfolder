import { ContentProvider } from './ContentProvider';
import { FileMetadata } from '../types/FileMetadata';
import { FileContent } from '../types/FileContent';
import { FileCategory } from '../types/FileCategory';
import { CoreMetadataExtractor } from '../metadata/CoreMetadataExtractor';
import { ExifExtractor } from '../metadata/ExifExtractor';
import * as fs from 'fs/promises';

/**
 * Content provider for image files
 * Handles images with EXIF metadata extraction
 */
export class ImageContentProvider extends ContentProvider {
  protected async extractMetadata(filePath: string): Promise<FileMetadata> {
    // Extract core metadata
    const core = await CoreMetadataExtractor.extract(
      filePath,
      this.watchedFolder,
      FileCategory.IMAGE
    );

    // Extract EXIF metadata
    const exif = await ExifExtractor.extract(filePath);

    return {
      ...core,
      exif,
    };
  }

  protected shouldSendContent(metadata: FileMetadata, size: number): boolean {
    // Only send if model supports images AND size is reasonable
    const threshold = this.thresholds.image?.fullContentMax ?? 5 * 1024 * 1024;
    return this.modelCapability.supportsImages && size <= threshold;
  }

  protected determineContentType(
    metadata: FileMetadata,
    size: number
  ): 'full' | 'partial' {
    // Images are always full or nothing (can't partially send an image)
    return 'full';
  }

  protected async extractContent(
    filePath: string,
    type: 'full' | 'partial',
    metadata: FileMetadata
  ): Promise<FileContent['content']> {
    // Read image file as buffer and encode to base64
    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString('base64');

    return {
      type: 'full',
      data: base64,
      format: 'base64',
    };
  }

  protected getAvailableTools(category: FileCategory): string[] {
    // Images are typically renamed or moved, not edited
    return ['rename_file', 'create_folder'];
  }
}
