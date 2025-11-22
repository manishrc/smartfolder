import { ContentProvider } from './ContentProvider';
import { FileMetadata } from '../types/FileMetadata';
import { FileContent } from '../types/FileContent';
import { FileCategory } from '../types/FileCategory';
import { CoreMetadataExtractor } from '../metadata/CoreMetadataExtractor';
import * as fs from 'fs/promises';

/**
 * Content provider for text files
 * Handles text documents, code files, and structured data
 */
export class TextContentProvider extends ContentProvider {
  protected async extractMetadata(filePath: string): Promise<FileMetadata> {
    // Extract core metadata
    const core = await CoreMetadataExtractor.extract(
      filePath,
      this.watchedFolder,
      FileCategory.TEXT_DOCUMENT
    );

    // Return combined metadata (text files don't have type-specific metadata)
    return core;
  }

  protected shouldSendContent(_metadata: FileMetadata, size: number): boolean {
    const threshold = this.thresholds.text?.metadataOnlyAbove ?? 100 * 1024;
    return size <= threshold;
  }

  protected determineContentType(
    _metadata: FileMetadata,
    size: number
  ): 'full' | 'partial' {
    const fullThreshold = this.thresholds.text?.fullContentMax ?? 10 * 1024;

    if (size <= fullThreshold) {
      return 'full';
    }
    return 'partial';
  }

  protected async extractContent(
    filePath: string,
    type: 'full' | 'partial',
    metadata: FileMetadata
  ): Promise<FileContent['content']> {
    if (type === 'full') {
      // Read full file content
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        type: 'full',
        data: content,
        format: 'text',
      };
    }

    // Partial: head + tail strategy
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const headLines = lines.slice(0, 50);
    const tailLines = lines.slice(-50);
    const omitted = Math.max(0, lines.length - 100);

    // Special handling for CSV files - preserve header
    let csvHeader: string[] = [];
    if (metadata.extension === '.csv' && lines.length > 0) {
      csvHeader = [lines[0]];
    }

    const partialLines = [
      ...(csvHeader.length > 0 ? ['=== CSV Header ===', ...csvHeader, ''] : []),
      '=== First 50 lines ===',
      ...headLines,
      ...(omitted > 0 ? [`\n... [${omitted} lines omitted] ...\n`] : []),
      '=== Last 50 lines ===',
      ...tailLines,
    ];

    const partialContent = partialLines.join('\n');

    return {
      type: 'partial',
      data: partialContent,
      format: 'text',
      truncation: {
        strategy: 'head-tail',
        originalSize: metadata.size,
        includedSize: Buffer.byteLength(partialContent),
        omittedSize: metadata.size - Buffer.byteLength(partialContent),
      },
    };
  }

  protected getAvailableTools(_category: FileCategory): string[] {
    return [
      'read_file',
      'write_file',
      'rename_file',
      'grep',
      'sed',
      'head',
      'tail',
      'create_folder',
    ];
  }
}
