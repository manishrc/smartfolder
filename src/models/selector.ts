import { ModelCapability } from '../types/ModelCapability';
import { FileCategory } from '../types/FileCategory';
import { MODEL_REGISTRY } from './registry';

/**
 * Selects the most appropriate model for a given file
 * Based on file category, size, and user preference
 *
 * @param fileCategory - The category of the file
 * @param fileSize - The size of the file in bytes
 * @param userPreference - Optional user-specified model string (e.g., 'openai/gpt-4o-mini')
 * @returns The selected model capability
 */
export function selectModelForFile(
  fileCategory: FileCategory,
  fileSize: number,
  userPreference?: string
): ModelCapability {
  // If user has a preference and it exists in registry, use it
  if (userPreference && MODEL_REGISTRY[userPreference]) {
    return MODEL_REGISTRY[userPreference];
  }

  // Auto-select based on file type and capabilities
  const candidates = Object.values(MODEL_REGISTRY).filter((model) =>
    model.bestFor.includes(fileCategory)
  );

  // If no candidates found, fall back to all models
  if (candidates.length === 0) {
    return MODEL_REGISTRY['openai/gpt-4o-mini'];
  }

  // Score models based on capabilities and cost
  const scored = candidates.map((model) => {
    let score = 0;

    // Prefer native support for specialized file types
    if (fileCategory === FileCategory.VIDEO && model.supportsVideo) {
      score += 100;
    }
    if (fileCategory === FileCategory.AUDIO && model.supportsAudio) {
      score += 100;
    }
    if (fileCategory === FileCategory.PDF && model.supportsPDF) {
      score += 50;
    }
    if (fileCategory === FileCategory.IMAGE && model.supportsImages) {
      score += 50;
    }

    // Prefer lower cost (inverse of cost gives higher score for cheaper models)
    score += (1 / model.costPerMillionInputTokens) * 10;

    // Prefer large context for big files (>50KB)
    if (fileSize > 50_000 && model.maxInputTokens > 500_000) {
      score += 20;
    }

    return { model, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return the highest-scored model
  return scored[0]?.model || MODEL_REGISTRY['openai/gpt-4o-mini'];
}

/**
 * Gets the model string for use with Vercel AI SDK v6
 * Format: 'provider/model-id' (e.g., 'openai/gpt-4o-mini')
 *
 * @param capability - The model capability object
 * @returns The model string for AI SDK
 */
export function getModelString(capability: ModelCapability): string {
  return `${capability.provider}/${capability.modelId}`;
}
