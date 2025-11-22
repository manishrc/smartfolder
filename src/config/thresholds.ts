import { SizeThresholds } from '../types/FileContent';

/**
 * Default size thresholds for content strategies
 * These can be overridden in the configuration file
 */
export const DEFAULT_THRESHOLDS: SizeThresholds = {
  text: {
    fullContentMax: 10 * 1024, // 10KB
    partialContentMax: 100 * 1024, // 100KB
    metadataOnlyAbove: 100 * 1024, // 100KB
  },
  image: {
    fullContentMax: 5 * 1024 * 1024, // 5MB
    metadataOnlyAbove: 5 * 1024 * 1024, // 5MB
  },
  pdf: {
    fullContentMax: 10 * 1024 * 1024, // 10MB
    metadataOnlyAbove: 10 * 1024 * 1024, // 10MB
  },
  video: {
    fullContentMax: 20 * 1024 * 1024, // 20MB
    metadataOnlyAbove: 20 * 1024 * 1024, // 20MB
  },
  audio: {
    fullContentMax: 10 * 1024 * 1024, // 10MB
    metadataOnlyAbove: 10 * 1024 * 1024, // 10MB
  },
};
