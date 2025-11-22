import { ContentProvider } from './ContentProvider';
import { FileMetadata } from '../types/FileMetadata';
import { FileContent } from '../types/FileContent';
import { FileCategory } from '../types/FileCategory';
import { CoreMetadataExtractor } from '../metadata/CoreMetadataExtractor';
import { VideoExtractor } from '../metadata/VideoExtractor';
import * as fs from 'fs/promises';

/**
 * Content provider for video files
 * Handles videos with metadata extraction
 * Only Gemini 2.0 Flash supports native video analysis
 */
export class VideoContentProvider extends ContentProvider {
  protected async extractMetadata(filePath: string): Promise<FileMetadata> {
    // Extract core metadata
    const core = await CoreMetadataExtractor.extract(
      filePath,
      this.watchedFolder,
      FileCategory.VIDEO
    );

    // Extract video metadata
    const video = await VideoExtractor.extract(filePath);

    return {
      ...core,
      video,
    };
  }

  protected shouldSendContent(metadata: FileMetadata, size: number): boolean {
    // Only send if model supports video AND size is reasonable
    const threshold = this.thresholds.video?.fullContentMax ?? 20 * 1024 * 1024;
    return this.modelCapability.supportsVideo && size <= threshold;
  }

  protected determineContentType(
    metadata: FileMetadata,
    size: number
  ): 'full' | 'partial' {
    // Videos are always full or nothing
    return 'full';
  }

  protected async extractContent(
    filePath: string,
    type: 'full' | 'partial',
    metadata: FileMetadata
  ): Promise<FileContent['content']> {
    // If model supports video, send as file part
    if (this.modelCapability.supportsVideo) {
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');

      return {
        type: 'full',
        data: base64,
        format: 'base64',
      };
    }

    // For models that don't support video, return metadata only
    return {
      type: 'none',
    };
  }

  protected getAvailableTools(category: FileCategory): string[] {
    return ['rename_file', 'create_folder'];
  }
}
