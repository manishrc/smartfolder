import { FileMetadata } from './FileMetadata';

/**
 * Content truncation strategy
 */
export interface TruncationInfo {
  strategy: 'head-tail' | 'sample' | 'summary';
  originalSize: number;
  includedSize: number;
  omittedSize: number;
}

/**
 * File content returned by content providers
 */
export interface FileContent {
  // Always included
  metadata: FileMetadata;

  // Optional content
  content?: {
    type: 'full' | 'partial' | 'none';
    data?: string | Buffer;
    format?: 'text' | 'base64' | 'file-part';
    truncation?: TruncationInfo;
  };

  // Available tools for content inspection
  availableTools: string[];
}

/**
 * Size thresholds for content strategies
 */
export interface SizeThresholds {
  text?: {
    fullContentMax: number; // Send full content below this size
    partialContentMax: number; // Send partial content below this size
    metadataOnlyAbove: number; // Send only metadata above this size
  };
  image?: {
    fullContentMax: number;
    metadataOnlyAbove: number;
  };
  pdf?: {
    fullContentMax: number;
    metadataOnlyAbove: number;
  };
  video?: {
    fullContentMax: number;
    metadataOnlyAbove: number;
  };
  audio?: {
    fullContentMax: number;
    metadataOnlyAbove: number;
  };
}
