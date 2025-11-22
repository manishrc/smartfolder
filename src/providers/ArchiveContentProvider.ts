import { ContentProvider } from './ContentProvider';
import { FileMetadata } from '../types/FileMetadata';
import { FileContent } from '../types/FileContent';
import { FileCategory } from '../types/FileCategory';
import { CoreMetadataExtractor } from '../metadata/CoreMetadataExtractor';
import { ArchiveExtractor } from '../metadata/ArchiveExtractor';

/**
 * Content provider for archive files
 * Handles archives by listing contents without sending binary data
 */
export class ArchiveContentProvider extends ContentProvider {
  protected async extractMetadata(filePath: string): Promise<FileMetadata> {
    // Extract core metadata
    const core = await CoreMetadataExtractor.extract(
      filePath,
      this.watchedFolder,
      FileCategory.ARCHIVE
    );

    // Extract archive metadata (file list)
    const archive = await ArchiveExtractor.extract(filePath);

    return {
      ...core,
      archive,
    };
  }

  protected shouldSendContent(_metadata: FileMetadata, _size: number): boolean {
    // Never send archive binary content to AI
    // The file list is included in metadata
    return false;
  }

  protected determineContentType(
    _metadata: FileMetadata,
    _size: number
  ): 'full' | 'partial' {
    // Not applicable - archives are always metadata-only
    return 'full';
  }

  protected async extractContent(
    _filePath: string,
    _type: 'full' | 'partial',
    _metadata: FileMetadata
  ): Promise<FileContent['content']> {
    // Archives are metadata-only
    return {
      type: 'none',
    };
  }

  protected getAvailableTools(_category: FileCategory): string[] {
    // Archives can be renamed or moved, potentially extracted later
    return ['rename_file', 'create_folder'];
  }
}
