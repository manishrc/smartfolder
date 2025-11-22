import { FileContent, SizeThresholds } from '../types/FileContent';
import { FileMetadata } from '../types/FileMetadata';
import { ModelCapability } from '../types/ModelCapability';
import { FileCategory } from '../types/FileCategory';

/**
 * Abstract base class for content providers
 * Uses Template Method pattern to define the workflow skeleton
 */
export abstract class ContentProvider {
  constructor(
    protected watchedFolder: string,
    protected modelCapability: ModelCapability,
    protected thresholds: SizeThresholds
  ) {}

  /**
   * Template method - defines the workflow skeleton
   * Subclasses implement specific steps
   */
  async provideContent(filePath: string): Promise<FileContent> {
    // Step 1: Always extract metadata (this is the core of our metadata-first approach)
    const metadata = await this.extractMetadata(filePath);
    const size = metadata.size;

    // Step 2: Decide if we should send content
    const shouldSendContent = this.shouldSendContent(metadata, size);

    if (!shouldSendContent) {
      return {
        metadata,
        content: { type: 'none' },
        availableTools: this.getAvailableTools(metadata.category),
      };
    }

    // Step 3: Decide full or partial content
    const contentType = this.determineContentType(metadata, size);

    // Step 4: Extract content based on strategy
    const content = await this.extractContent(filePath, contentType, metadata);

    return {
      metadata,
      content,
      availableTools: this.getAvailableTools(metadata.category),
    };
  }

  /**
   * Extract file metadata (always called)
   * @param filePath - Absolute path to the file
   */
  protected abstract extractMetadata(filePath: string): Promise<FileMetadata>;

  /**
   * Determine if content should be sent to AI
   * @param metadata - File metadata
   * @param size - File size in bytes
   */
  protected abstract shouldSendContent(
    metadata: FileMetadata,
    size: number
  ): boolean;

  /**
   * Determine content type (full or partial)
   * @param metadata - File metadata
   * @param size - File size in bytes
   */
  protected abstract determineContentType(
    metadata: FileMetadata,
    size: number
  ): 'full' | 'partial';

  /**
   * Extract file content based on strategy
   * @param filePath - Absolute path to the file
   * @param type - Content type (full or partial)
   * @param metadata - File metadata
   */
  protected abstract extractContent(
    filePath: string,
    type: 'full' | 'partial',
    metadata: FileMetadata
  ): Promise<FileContent['content']>;

  /**
   * Get available tools for this file category
   * @param category - File category
   */
  protected abstract getAvailableTools(category: FileCategory): string[];
}
