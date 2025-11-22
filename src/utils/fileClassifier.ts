import * as path from 'path';
import { FileCategory } from '../types/FileCategory';

/**
 * Classify a file into a FileCategory based on extension and MIME type
 */
export function classifyFile(
  filePath: string,
  mimeType?: string
): FileCategory {
  const ext = path.extname(filePath).toLowerCase();

  // Images
  const imageExts = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
    '.bmp',
    '.ico',
    '.heic',
    '.heif',
  ];
  if (imageExts.includes(ext) || mimeType?.startsWith('image/')) {
    return FileCategory.IMAGE;
  }

  // PDFs
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    return FileCategory.PDF;
  }

  // Videos
  const videoExts = ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.flv', '.wmv'];
  if (videoExts.includes(ext) || mimeType?.startsWith('video/')) {
    return FileCategory.VIDEO;
  }

  // Audio
  const audioExts = [
    '.mp3',
    '.wav',
    '.ogg',
    '.m4a',
    '.flac',
    '.aac',
    '.wma',
  ];
  if (audioExts.includes(ext) || mimeType?.startsWith('audio/')) {
    return FileCategory.AUDIO;
  }

  // Office documents
  const officeExts = [
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.odt',
    '.ods',
    '.odp',
  ];
  if (officeExts.includes(ext)) {
    return FileCategory.OFFICE_DOC;
  }

  // Archives
  const archiveExts = ['.zip', '.tar', '.gz', '.rar', '.7z', '.tgz', '.bz2'];
  if (archiveExts.includes(ext)) {
    return FileCategory.ARCHIVE;
  }

  // Code files
  const codeExts = [
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.py',
    '.java',
    '.c',
    '.cpp',
    '.cs',
    '.go',
    '.rs',
    '.rb',
    '.php',
    '.swift',
    '.kt',
    '.scala',
    '.sh',
    '.bash',
    '.zsh',
  ];
  if (codeExts.includes(ext)) {
    return FileCategory.CODE_FILE;
  }

  // Structured data
  const dataExts = ['.json', '.xml', '.yaml', '.yml', '.toml', '.csv'];
  if (dataExts.includes(ext)) {
    return FileCategory.STRUCTURED_DATA;
  }

  // Text documents (default for text files)
  const textExts = [
    '.txt',
    '.md',
    '.markdown',
    '.log',
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.sass',
    '.less',
  ];
  if (textExts.includes(ext) || mimeType?.startsWith('text/')) {
    return FileCategory.TEXT_DOCUMENT;
  }

  // Default to text document for unknown types
  return FileCategory.TEXT_DOCUMENT;
}

/**
 * Detect MIME type from file extension
 * (This maintains compatibility with existing code)
 */
export function detectMimeType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    // Documents
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.heic': 'image/heic',
    '.heif': 'image/heif',

    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',

    // Video
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',

    // Archives
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed',

    // Structured data
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'application/toml',
  };

  return mimeTypes[ext];
}
