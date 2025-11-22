import { ContentProvider } from './ContentProvider';
import { FileMetadata } from '../types/FileMetadata';
import { FileContent } from '../types/FileContent';
import { FileCategory } from '../types/FileCategory';
import { CoreMetadataExtractor } from '../metadata/CoreMetadataExtractor';
import { AudioExtractor } from '../metadata/AudioExtractor';
import * as fs from 'fs/promises';

/**
 * Content provider for audio files
 * Handles audio with metadata extraction
 * Only Gemini 2.0 Flash supports native audio analysis
 */
export class AudioContentProvider extends ContentProvider {
  protected async extractMetadata(filePath: string): Promise<FileMetadata> {
    // Extract core metadata
    const core = await CoreMetadataExtractor.extract(
      filePath,
      this.watchedFolder,
      FileCategory.AUDIO
    );

    // Extract audio metadata
    const audio = await AudioExtractor.extract(filePath);

    return {
      ...core,
      audio,
    };
  }

  protected shouldSendContent(_metadata: FileMetadata, size: number): boolean {
    // Only send if model supports audio AND size is reasonable
    const threshold = this.thresholds.audio?.fullContentMax ?? 10 * 1024 * 1024;
    return this.modelCapability.supportsAudio && size <= threshold;
  }

  protected determineContentType(
    _metadata: FileMetadata,
    _size: number
  ): 'full' | 'partial' {
    // Audio files are always full or nothing
    return 'full';
  }

  protected async extractContent(
    filePath: string,
    _type: 'full' | 'partial',
    _metadata: FileMetadata
  ): Promise<FileContent['content']> {
    // If model supports audio, send as file part
    if (this.modelCapability.supportsAudio) {
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');

      return {
        type: 'full',
        data: base64,
        format: 'base64',
      };
    }

    // For models that don't support audio, return metadata only
    return {
      type: 'none',
    };
  }

  protected getAvailableTools(_category: FileCategory): string[] {
    return ['rename_file', 'create_folder'];
  }
}
