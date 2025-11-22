import { FileCategory, ModelStrength } from './FileCategory';

/**
 * Model capability declaration for routing decisions
 */
export interface ModelCapability {
  // Model identification
  modelId: string;
  provider: 'openai' | 'google' | 'anthropic' | 'custom';

  // Native support capabilities
  supportsText: boolean;
  supportsImages: boolean;
  supportsPDF: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;

  // Context limits
  maxInputTokens: number;
  maxOutputTokens: number;

  // Cost per million tokens
  costPerMillionInputTokens: number;
  costPerMillionOutputTokens: number;

  // Strengths (for auto-selection)
  strengths: ModelStrength[];

  // Optimal use cases
  bestFor: FileCategory[];
}
