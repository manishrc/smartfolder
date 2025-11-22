import { ContentProvider } from './ContentProvider';
import { FileMetadata } from '../types/FileMetadata';
import { FileContent } from '../types/FileContent';
import { FileCategory } from '../types/FileCategory';
import { CoreMetadataExtractor } from '../metadata/CoreMetadataExtractor';
import { FolderExtractor } from '../metadata/FolderExtractor';

/**
 * Content provider for folders
 * Analyzes folder contents and structure
 */
export class FolderContentProvider extends ContentProvider {
  protected async extractMetadata(filePath: string): Promise<FileMetadata> {
    // Extract core metadata
    const core = await CoreMetadataExtractor.extract(
      filePath,
      this.watchedFolder,
      FileCategory.FOLDER
    );

    // Extract folder metadata (contents analysis)
    const folder = await FolderExtractor.extract(filePath);

    return {
      ...core,
      folder,
    };
  }

  protected shouldSendContent(metadata: FileMetadata, size: number): boolean {
    // Folders are always metadata-only (no content to send)
    return false;
  }

  protected determineContentType(
    metadata: FileMetadata,
    size: number
  ): 'full' | 'partial' {
    // Not applicable - folders are always metadata-only
    return 'full';
  }

  protected async extractContent(
    filePath: string,
    type: 'full' | 'partial',
    metadata: FileMetadata
  ): Promise<FileContent['content']> {
    // Folders are metadata-only
    return {
      type: 'none',
    };
  }

  protected getAvailableTools(category: FileCategory): string[] {
    // Tools available for folder operations
    return ['rename_file', 'create_folder'];
  }
}
