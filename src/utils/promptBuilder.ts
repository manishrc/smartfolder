import { FileContent } from '../types/FileContent';
import * as path from 'path';

/**
 * Build a user prompt from FileContent
 * This formats metadata and content for the AI in a structured way
 */
export function buildPromptFromFileContent(fileContent: FileContent): string {
  let prompt = 'A new file was detected:\n\n';

  // Always include metadata section
  prompt += '## File Metadata\n';
  prompt += `- Path: ${fileContent.metadata.relativePath}\n`;
  prompt += `- Size: ${fileContent.metadata.size.toLocaleString()} bytes\n`;
  prompt += `- Type: ${fileContent.metadata.category}\n`;
  prompt += `- Created: ${fileContent.metadata.created}\n`;
  prompt += `- Modified: ${fileContent.metadata.modified}\n`;

  if (fileContent.metadata.hash) {
    prompt += `- Hash (${fileContent.metadata.hash.algorithm}): ${fileContent.metadata.hash.value}\n`;
  }

  // Image EXIF metadata
  if (fileContent.metadata.exif) {
    prompt += '\n## Image Metadata (EXIF)\n';
    const exif = fileContent.metadata.exif;

    if (exif.Make || exif.Model) {
      prompt += `- Camera: ${exif.Make || ''} ${exif.Model || ''}`.trim() + '\n';
    }
    if (exif.DateTimeOriginal || exif.DateTime) {
      prompt += `- Date Taken: ${exif.DateTimeOriginal || exif.DateTime}\n`;
    }
    if (exif.ImageWidth && exif.ImageHeight) {
      prompt += `- Dimensions: ${exif.ImageWidth}x${exif.ImageHeight}\n`;
    }
    if (exif.GPSLatitude && exif.GPSLongitude) {
      prompt += `- Location: ${exif.GPSLatitude}, ${exif.GPSLongitude}\n`;
    }
    if (exif.ISO) {
      prompt += `- ISO: ${exif.ISO}\n`;
    }
    if (exif.FNumber) {
      prompt += `- Aperture: f/${exif.FNumber}\n`;
    }
    if (exif.ExposureTime) {
      prompt += `- Exposure: ${exif.ExposureTime}s\n`;
    }
    if (exif.FocalLength) {
      prompt += `- Focal Length: ${exif.FocalLength}mm\n`;
    }
    if (exif.LensModel) {
      prompt += `- Lens: ${exif.LensModel}\n`;
    }
  }

  // PDF metadata
  if (fileContent.metadata.pdf) {
    prompt += '\n## PDF Metadata\n';
    const pdf = fileContent.metadata.pdf;

    if (pdf.Title) prompt += `- Title: ${pdf.Title}\n`;
    if (pdf.Author) prompt += `- Author: ${pdf.Author}\n`;
    if (pdf.Subject) prompt += `- Subject: ${pdf.Subject}\n`;
    if (pdf.Pages) prompt += `- Pages: ${pdf.Pages}\n`;
    if (pdf.Creator) prompt += `- Creator: ${pdf.Creator}\n`;
    if (pdf.Producer) prompt += `- Producer: ${pdf.Producer}\n`;
    if (pdf.CreationDate) prompt += `- Creation Date: ${pdf.CreationDate}\n`;
    if (pdf.ModDate) prompt += `- Modification Date: ${pdf.ModDate}\n`;
  }

  // Audio metadata
  if (fileContent.metadata.audio) {
    prompt += '\n## Audio Metadata\n';
    const audio = fileContent.metadata.audio;

    if (audio.title) prompt += `- Title: ${audio.title}\n`;
    if (audio.artist) prompt += `- Artist: ${audio.artist}\n`;
    if (audio.album) prompt += `- Album: ${audio.album}\n`;
    if (audio.year) prompt += `- Year: ${audio.year}\n`;
    if (audio.genre) prompt += `- Genre: ${audio.genre.join(', ')}\n`;
    if (audio.duration)
      prompt += `- Duration: ${Math.floor(audio.duration / 60)}:${String(Math.floor(audio.duration % 60)).padStart(2, '0')}\n`;
    if (audio.bitrate) prompt += `- Bitrate: ${audio.bitrate} kbps\n`;
    if (audio.sampleRate) prompt += `- Sample Rate: ${audio.sampleRate} Hz\n`;
    if (audio.codec) prompt += `- Codec: ${audio.codec}\n`;
    if (audio.channels) prompt += `- Channels: ${audio.channels}\n`;
  }

  // Video metadata
  if (fileContent.metadata.video) {
    prompt += '\n## Video Metadata\n';
    const video = fileContent.metadata.video;

    if (video.width && video.height) {
      prompt += `- Resolution: ${video.width}x${video.height}\n`;
    }
    if (video.duration) {
      const minutes = Math.floor(video.duration / 60);
      const seconds = Math.floor(video.duration % 60);
      prompt += `- Duration: ${minutes}:${String(seconds).padStart(2, '0')}\n`;
    }
    if (video.codec) prompt += `- Video Codec: ${video.codec}\n`;
    if (video.audioCodec) prompt += `- Audio Codec: ${video.audioCodec}\n`;
    if (video.frameRate) prompt += `- Frame Rate: ${video.frameRate.toFixed(2)} fps\n`;
    if (video.bitrate) prompt += `- Bitrate: ${video.bitrate} kbps\n`;
    if (video.hasAudio !== undefined)
      prompt += `- Has Audio: ${video.hasAudio ? 'Yes' : 'No'}\n`;
    if (video.hasSubtitles !== undefined)
      prompt += `- Has Subtitles: ${video.hasSubtitles ? 'Yes' : 'No'}\n`;
  }

  // Archive metadata
  if (fileContent.metadata.archive) {
    prompt += '\n## Archive Metadata\n';
    const archive = fileContent.metadata.archive;

    prompt += `- Archive Type: ${archive.type.toUpperCase()}\n`;
    if (archive.fileCount) prompt += `- File Count: ${archive.fileCount}\n`;
    if (archive.uncompressedSize) {
      const sizeMB = (archive.uncompressedSize / (1024 * 1024)).toFixed(2);
      prompt += `- Uncompressed Size: ${sizeMB} MB\n`;
    }

    if (archive.files && archive.files.length > 0) {
      prompt += '\n### Files in Archive (first 20):\n';
      archive.files.slice(0, 20).forEach((file) => {
        prompt += `- ${file.name} (${(file.size / 1024).toFixed(2)} KB)\n`;
      });
      if (archive.files.length > 20) {
        prompt += `... and ${archive.files.length - 20} more files\n`;
      }
    }
  }

  // Folder metadata
  if (fileContent.metadata.folder) {
    prompt += '\n## Folder Metadata\n';
    const folder = fileContent.metadata.folder;

    prompt += `- Files: ${folder.fileCount}\n`;
    prompt += `- Subfolders: ${folder.subfolderCount}\n`;
    const sizeMB = (folder.totalSize / (1024 * 1024)).toFixed(2);
    prompt += `- Total Size: ${sizeMB} MB\n`;

    if (Object.keys(folder.types).length > 0) {
      prompt += '\n### File Types:\n';
      Object.entries(folder.types)
        .sort(([, a], [, b]) => b - a) // Sort by count descending
        .forEach(([ext, count]) => {
          prompt += `- ${ext}: ${count} file${count !== 1 ? 's' : ''}\n`;
        });
    }
  }

  // Content section
  if (fileContent.content?.type === 'full') {
    prompt += '\n## File Content\n';
    if (fileContent.content.format === 'text') {
      prompt += '```\n' + fileContent.content.data + '\n```\n';
    } else {
      prompt += '(Binary content included as file part)\n';
    }
  } else if (fileContent.content?.type === 'partial') {
    prompt += '\n## File Content (Truncated)\n';
    prompt += '```\n' + fileContent.content.data + '\n```\n';
    if (fileContent.content.truncation) {
      const omittedKB = (
        fileContent.content.truncation.omittedSize / 1024
      ).toFixed(2);
      prompt += `\n[${omittedKB} KB omitted - ${fileContent.content.truncation.strategy} strategy]\n`;
    }
  } else {
    prompt += '\n## File Content\n';
    prompt += 'Content not included (file too large or unsupported type).\n';
    prompt += 'Use available tools to inspect the file if needed.\n';
  }

  // Available tools
  prompt += '\n## Available Tools\n';
  fileContent.availableTools.forEach((tool) => {
    prompt += `- ${tool}\n`;
  });

  // Instructions for renaming
  const originalExtension = path.extname(fileContent.metadata.relativePath);
  prompt += `\n## Instructions\n`;
  prompt += `If you need to rename this file, use rename_file with 'from'="${fileContent.metadata.relativePath}" and 'to'="<new-name>${originalExtension}".\n`;
  prompt += `You MUST preserve the original file extension (${originalExtension}).\n`;

  return prompt;
}

/**
 * Build multimodal prompt with file parts for binary content
 * Returns either a string or an array with text and file parts
 */
export function buildMultimodalPrompt(
  fileContent: FileContent
):
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image'; image: string }
      | { type: 'file'; data: Buffer; mediaType: string }
    > {
  const textPrompt = buildPromptFromFileContent(fileContent);

  // If content is binary and included, attach it as a file part
  if (
    fileContent.content?.type === 'full' &&
    fileContent.content.format === 'base64' &&
    fileContent.content.data
  ) {
    const mimeType = fileContent.metadata.mimeType;

    // For images, use image part
    if (mimeType?.startsWith('image/')) {
      return [
        { type: 'text' as const, text: textPrompt },
        {
          type: 'image' as const,
          image: fileContent.content.data as string,
        },
      ];
    }

    // For other binary files (PDFs, videos, audio), use file part
    if (mimeType && typeof fileContent.content.data === 'string') {
      return [
        { type: 'text' as const, text: textPrompt },
        {
          type: 'file' as const,
          data: Buffer.from(fileContent.content.data, 'base64'),
          mediaType: mimeType,
        },
      ];
    }
  }

  // Default to text-only prompt
  return textPrompt;
}
