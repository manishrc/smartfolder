import { PDFMetadata } from '../types/FileMetadata';
import * as fs from 'fs/promises';

/**
 * PDF metadata extractor
 * Uses pdf-parse library (optional peer dependency)
 */
export class PDFExtractor {
  /**
   * Extract metadata from a PDF file
   *
   * @param filePath - Absolute path to the PDF file
   * @returns PDF metadata or undefined if extraction fails
   */
  static async extract(filePath: string): Promise<PDFMetadata | undefined> {
    try {
      // Try to import pdf-parse (optional dependency)
      const pdfParse = await import('pdf-parse').catch(() => null);
      if (!pdfParse) {
        console.warn(
          'pdf-parse not installed, skipping PDF metadata extraction. Install with: npm install pdf-parse'
        );
        return undefined;
      }

      // Read PDF file
      const dataBuffer = await fs.readFile(filePath);

      // Parse PDF
      const data = await pdfParse.default(dataBuffer);

      // Extract metadata
      const metadata: PDFMetadata = {
        Pages: data.numpages,
      };

      // Add info fields if available
      if (data.info) {
        if (data.info.Title) metadata.Title = data.info.Title;
        if (data.info.Author) metadata.Author = data.info.Author;
        if (data.info.Subject) metadata.Subject = data.info.Subject;
        if (data.info.Creator) metadata.Creator = data.info.Creator;
        if (data.info.Producer) metadata.Producer = data.info.Producer;
        if (data.info.CreationDate) metadata.CreationDate = data.info.CreationDate;
        if (data.info.ModDate) metadata.ModDate = data.info.ModDate;
      }

      return metadata;
    } catch (error) {
      console.warn(`PDF metadata extraction failed for ${filePath}:`, error);
      return undefined;
    }
  }
}
