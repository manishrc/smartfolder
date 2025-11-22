import { ModelCapability } from '../types/ModelCapability';
import { FileCategory, ModelStrength } from '../types/FileCategory';

/**
 * Central registry of model capabilities
 * Used for auto-selection and routing decisions
 */
export const MODEL_REGISTRY: Record<string, ModelCapability> = {
  'openai/gpt-4o-mini': {
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    supportsText: true,
    supportsImages: true,
    supportsPDF: true,
    supportsAudio: false,
    supportsVideo: false,
    maxInputTokens: 128_000,
    maxOutputTokens: 16_384,
    costPerMillionInputTokens: 0.15,
    costPerMillionOutputTokens: 0.6,
    strengths: [
      ModelStrength.COST_EFFECTIVE,
      ModelStrength.IMAGE_ANALYSIS,
      ModelStrength.FAST_INFERENCE,
    ],
    bestFor: [
      FileCategory.TEXT_DOCUMENT,
      FileCategory.IMAGE,
      FileCategory.PDF,
      FileCategory.CODE_FILE,
    ],
  },

  'openai/gpt-4.1-nano': {
    modelId: 'gpt-4.1-nano',
    provider: 'openai',
    supportsText: true,
    supportsImages: true,
    supportsPDF: false,
    supportsAudio: false,
    supportsVideo: false,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 16_384,
    costPerMillionInputTokens: 0.1,
    costPerMillionOutputTokens: 0.4,
    strengths: [
      ModelStrength.LARGE_CONTEXT,
      ModelStrength.COST_EFFECTIVE,
      ModelStrength.FAST_INFERENCE,
    ],
    bestFor: [
      FileCategory.TEXT_DOCUMENT,
      FileCategory.CODE_FILE,
      FileCategory.STRUCTURED_DATA,
    ],
  },

  'google/gemini-2.0-flash-exp': {
    modelId: 'gemini-2.0-flash-exp',
    provider: 'google',
    supportsText: true,
    supportsImages: true,
    supportsPDF: false,
    supportsAudio: true,
    supportsVideo: true,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8_192,
    costPerMillionInputTokens: 0.075,
    costPerMillionOutputTokens: 0.3,
    strengths: [
      ModelStrength.VIDEO_ANALYSIS,
      ModelStrength.AUDIO_ANALYSIS,
      ModelStrength.FAST_INFERENCE,
      ModelStrength.LARGE_CONTEXT,
    ],
    bestFor: [FileCategory.VIDEO, FileCategory.AUDIO, FileCategory.IMAGE],
  },
};
