import { VideoMetadata } from '../types/FileMetadata';

/**
 * Video metadata extractor
 * Uses fluent-ffmpeg library (optional peer dependency)
 * Requires ffmpeg to be installed on the system
 */
export class VideoExtractor {
  /**
   * Extract metadata from a video file
   *
   * @param filePath - Absolute path to the video file
   * @returns Video metadata or undefined if extraction fails
   */
  static async extract(filePath: string): Promise<VideoMetadata | undefined> {
    try {
      // Try to import fluent-ffmpeg (optional dependency)
      const ffmpeg = await import('fluent-ffmpeg').catch(() => null);
      if (!ffmpeg) {
        console.warn(
          'fluent-ffmpeg not installed, skipping video metadata extraction. Install with: npm install fluent-ffmpeg'
        );
        return undefined;
      }

      // Get video metadata using ffprobe
      return new Promise<VideoMetadata | undefined>((resolve) => {
        ffmpeg.default(filePath).ffprobe((err: any, data: any) => {
          if (err) {
            console.warn(`Video metadata extraction failed for ${filePath}:`, err);
            resolve(undefined);
            return;
          }

          const videoMetadata: VideoMetadata = {};

          // Find video stream
          const videoStream = data.streams?.find(
            (s: any) => s.codec_type === 'video'
          );
          if (videoStream) {
            if (videoStream.width) videoMetadata.width = videoStream.width;
            if (videoStream.height) videoMetadata.height = videoStream.height;
            if (videoStream.codec_name)
              videoMetadata.codec = videoStream.codec_name;
            if (videoStream.r_frame_rate) {
              // Parse frame rate (e.g., "30000/1001")
              const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
              videoMetadata.frameRate = den ? num / den : num;
            }
            if (videoStream.bit_rate)
              videoMetadata.bitrate = Math.round(
                videoStream.bit_rate / 1000
              ); // Convert to kbps
          }

          // Find audio stream
          const audioStream = data.streams?.find(
            (s: any) => s.codec_type === 'audio'
          );
          if (audioStream) {
            videoMetadata.hasAudio = true;
            if (audioStream.codec_name)
              videoMetadata.audioCodec = audioStream.codec_name;
          } else {
            videoMetadata.hasAudio = false;
          }

          // Check for subtitles
          const subtitleStream = data.streams?.find(
            (s: any) => s.codec_type === 'subtitle'
          );
          videoMetadata.hasSubtitles = !!subtitleStream;

          // Duration from format
          if (data.format?.duration) {
            videoMetadata.duration = parseFloat(data.format.duration);
          }

          resolve(videoMetadata);
        });
      });
    } catch (error) {
      console.warn(`Video metadata extraction failed for ${filePath}:`, error);
      return undefined;
    }
  }
}
