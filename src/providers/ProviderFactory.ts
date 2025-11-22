import { ContentProvider } from './ContentProvider';
import { FileCategory } from '../types/FileCategory';
import { ModelCapability } from '../types/ModelCapability';
import { SizeThresholds } from '../types/FileContent';

// Import concrete providers (will be implemented in Phase 3)
import { TextContentProvider } from './TextContentProvider';
import { ImageContentProvider } from './ImageContentProvider';
import { PDFContentProvider } from './PDFContentProvider';
import { VideoContentProvider } from './VideoContentProvider';
import { AudioContentProvider } from './AudioContentProvider';
import { ArchiveContentProvider } from './ArchiveContentProvider';
import { FolderContentProvider } from './FolderContentProvider';

/**
 * Factory for creating appropriate content providers
 * Uses Factory Pattern to encapsulate provider instantiation
 */
export class ContentProviderFactory {
  /**
   * Creates a content provider for the given file category
   *
   * @param category - The file category
   * @param watchedFolder - The root folder being watched
   * @param modelCapability - The model that will process this file
   * @param thresholds - Size thresholds for content strategies
   * @returns An appropriate ContentProvider instance
   */
  static createProvider(
    category: FileCategory,
    watchedFolder: string,
    modelCapability: ModelCapability,
    thresholds: SizeThresholds
  ): ContentProvider {
    switch (category) {
      case FileCategory.TEXT_DOCUMENT:
      case FileCategory.CODE_FILE:
      case FileCategory.STRUCTURED_DATA:
        return new TextContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );

      case FileCategory.IMAGE:
        return new ImageContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );

      case FileCategory.PDF:
        return new PDFContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );

      case FileCategory.VIDEO:
        return new VideoContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );

      case FileCategory.AUDIO:
        return new AudioContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );

      case FileCategory.ARCHIVE:
        return new ArchiveContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );

      case FileCategory.FOLDER:
        return new FolderContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );

      case FileCategory.OFFICE_DOC:
        // Office docs are treated like text files (extract text)
        return new TextContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );

      default:
        // Default to text provider for unknown types
        return new TextContentProvider(
          watchedFolder,
          modelCapability,
          thresholds
        );
    }
  }
}
