import { FileCategory } from './FileCategory';

/**
 * Core file system metadata (always extracted)
 */
export interface CoreMetadata {
  path: string; // Absolute path
  relativePath: string; // Relative to watched folder
  fileName: string; // Base name
  extension: string; // File extension
  size: number; // Bytes
  created: string; // ISO timestamp
  modified: string; // ISO timestamp
  mimeType?: string; // Detected MIME type
  category: FileCategory; // High-level category
  hash?: {
    // File hash for deduplication
    algorithm: 'sha256';
    value: string;
  };
}

/**
 * Image metadata (EXIF)
 */
export interface ExifMetadata {
  Make?: string; // Camera manufacturer
  Model?: string; // Camera model
  DateTimeOriginal?: string; // When photo was taken
  DateTime?: string; // When file was modified
  GPSLatitude?: number; // Latitude
  GPSLongitude?: number; // Longitude
  ImageWidth?: number; // Width in pixels
  ImageHeight?: number; // Height in pixels
  Orientation?: number; // Image orientation
  ISO?: number; // ISO speed
  FNumber?: number; // Aperture
  ExposureTime?: number; // Shutter speed
  FocalLength?: number; // Focal length (mm)
  LensModel?: string; // Lens used
  Software?: string; // Software used
}

/**
 * PDF metadata
 */
export interface PDFMetadata {
  Title?: string;
  Author?: string;
  Subject?: string;
  Creator?: string; // Creating application
  Producer?: string; // PDF producer
  CreationDate?: string;
  ModDate?: string;
  Pages?: number; // Page count
}

/**
 * Audio metadata
 */
export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string[];
  duration?: number; // Seconds
  bitrate?: number; // Kbps
  sampleRate?: number; // Hz
  codec?: string; // Audio codec
  channels?: number; // 1 = mono, 2 = stereo
}

/**
 * Video metadata
 */
export interface VideoMetadata {
  duration?: number; // Seconds
  width?: number; // Resolution width
  height?: number; // Resolution height
  codec?: string; // Video codec
  frameRate?: number; // FPS
  bitrate?: number; // Kbps
  audioCodec?: string; // Audio codec
  hasAudio?: boolean;
  hasSubtitles?: boolean;
}

/**
 * Archive metadata
 */
export interface ArchiveMetadata {
  type: 'zip' | 'tar' | 'gz' | 'rar' | '7z';
  fileCount?: number;
  uncompressedSize?: number;
  files?: Array<{
    name: string;
    size: number;
    compressed: boolean;
  }>;
}

/**
 * Folder metadata
 */
export interface FolderMetadata {
  fileCount: number;
  subfolderCount: number;
  totalSize: number; // Bytes (recursive)
  types: {
    // File type distribution
    [extension: string]: number;
  };
}

/**
 * Complete file metadata (includes all type-specific metadata)
 */
export interface FileMetadata extends CoreMetadata {
  // Type-specific metadata
  exif?: ExifMetadata; // Images
  pdf?: PDFMetadata; // PDFs
  audio?: AudioMetadata; // Audio files
  video?: VideoMetadata; // Video files
  archive?: ArchiveMetadata; // Archives
  folder?: FolderMetadata; // Folders
}
