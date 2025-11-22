import { ContentProvider } from './ContentProvider';
import { FileMetadata } from '../types/FileMetadata';
import { FileContent } from '../types/FileContent';
import { FileCategory } from '../types/FileCategory';
import { CoreMetadataExtractor } from '../metadata/CoreMetadataExtractor';
import { PDFExtractor } from '../metadata/PDFExtractor';
import * as fs from 'fs/promises';

/**
 * Content provider for PDF files
 * Handles PDFs with metadata extraction and optional text extraction
 */
export class PDFContentProvider extends ContentProvider {
  protected async extractMetadata(filePath: string): Promise<FileMetadata> {
    // Extract core metadata
    const core = await CoreMetadataExtractor.extract(
      filePath,
      this.watchedFolder,
      FileCategory.PDF
    );

    // Extract PDF metadata
    const pdf = await PDFExtractor.extract(filePath);

    return {
      ...core,
      pdf,
    };
  }

  protected shouldSendContent(_metadata: FileMetadata, size: number): boolean {
    // Send if model supports PDF natively AND size is reasonable
    const threshold = this.thresholds.pdf?.fullContentMax ?? 10 * 1024 * 1024;
    return this.modelCapability.supportsPDF && size <= threshold;
  }

  protected determineContentType(
    _metadata: FileMetadata,
    _size: number
  ): 'full' | 'partial' {
    // PDFs are sent in full if model supports them
    return 'full';
  }

  protected async extractContent(
    filePath: string,
    _type: 'full' | 'partial',
    _metadata: FileMetadata
  ): Promise<FileContent['content']> {
    // If model supports PDFs natively, send as file part
    if (this.modelCapability.supportsPDF) {
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');

      return {
        type: 'full',
        data: base64,
        format: 'base64',
      };
    }

    // For models that don't support PDFs, we would extract text here
    // For now, return metadata only
    return {
      type: 'none',
    };
  }

  protected getAvailableTools(_category: FileCategory): string[] {
    return ['rename_file', 'create_folder'];
  }
}
