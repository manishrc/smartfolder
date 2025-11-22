import { AudioMetadata } from '../types/FileMetadata';

/**
 * Audio metadata extractor
 * Uses music-metadata library (optional peer dependency)
 */
export class AudioExtractor {
  /**
   * Extract metadata from an audio file
   *
   * @param filePath - Absolute path to the audio file
   * @returns Audio metadata or undefined if extraction fails
   */
  static async extract(filePath: string): Promise<AudioMetadata | undefined> {
    try {
      // Try to import music-metadata (optional dependency)
      const mm = await import('music-metadata').catch(() => null);
      if (!mm) {
        console.warn(
          'music-metadata not installed, skipping audio metadata extraction. Install with: npm install music-metadata'
        );
        return undefined;
      }

      // Parse audio file
      const metadata = await mm.parseFile(filePath);

      const audioMetadata: AudioMetadata = {};

      // Extract common fields
      if (metadata.common.title) audioMetadata.title = metadata.common.title;
      if (metadata.common.artist) audioMetadata.artist = metadata.common.artist;
      if (metadata.common.album) audioMetadata.album = metadata.common.album;
      if (metadata.common.year) audioMetadata.year = metadata.common.year;
      if (metadata.common.genre) audioMetadata.genre = metadata.common.genre;

      // Extract format fields
      if (metadata.format.duration)
        audioMetadata.duration = metadata.format.duration;
      if (metadata.format.bitrate)
        audioMetadata.bitrate = Math.round(metadata.format.bitrate / 1000); // Convert to kbps
      if (metadata.format.sampleRate)
        audioMetadata.sampleRate = metadata.format.sampleRate;
      if (metadata.format.codec) audioMetadata.codec = metadata.format.codec;
      if (metadata.format.numberOfChannels)
        audioMetadata.channels = metadata.format.numberOfChannels;

      return audioMetadata;
    } catch (error) {
      console.warn(`Audio metadata extraction failed for ${filePath}:`, error);
      return undefined;
    }
  }
}
