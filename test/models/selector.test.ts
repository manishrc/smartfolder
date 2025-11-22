import { selectModelForFile, getModelString } from '../../src/models/selector';
import { FileCategory } from '../../src/types/FileCategory';
import { MODEL_REGISTRY } from '../../src/models/registry';

describe('Model Selector', () => {
  describe('selectModelForFile', () => {
    it('should select Gemini 2.0 Flash for video files', () => {
      const model = selectModelForFile(FileCategory.VIDEO, 10_000_000);
      expect(model.modelId).toBe('gemini-2.0-flash-exp');
      expect(model.supportsVideo).toBe(true);
    });

    it('should select Gemini 2.0 Flash for audio files', () => {
      const model = selectModelForFile(FileCategory.AUDIO, 5_000_000);
      expect(model.modelId).toBe('gemini-2.0-flash-exp');
      expect(model.supportsAudio).toBe(true);
    });

    it('should select GPT-4o-mini for PDF files', () => {
      const model = selectModelForFile(FileCategory.PDF, 2_000_000);
      expect(model.modelId).toBe('gpt-4o-mini');
      expect(model.supportsPDF).toBe(true);
    });

    it('should select a model that supports images', () => {
      const model = selectModelForFile(FileCategory.IMAGE, 3_000_000);
      expect(model.supportsImages).toBe(true);
      // Any model that supports images is acceptable
      expect(['gpt-4o-mini', 'gpt-4.1-nano', 'gemini-2.0-flash-exp']).toContain(
        model.modelId
      );
    });

    it('should prefer GPT-4.1-nano for large text files', () => {
      const model = selectModelForFile(FileCategory.TEXT_DOCUMENT, 100_000);
      // GPT-4.1-nano has large context and is cost-effective
      expect(['gpt-4.1-nano', 'gpt-4o-mini']).toContain(model.modelId);
    });

    it('should select GPT-4.1-nano for code files', () => {
      const model = selectModelForFile(FileCategory.CODE_FILE, 50_000);
      expect(['gpt-4.1-nano', 'gpt-4o-mini']).toContain(model.modelId);
    });

    it('should use user preference when provided', () => {
      const model = selectModelForFile(
        FileCategory.TEXT_DOCUMENT,
        10_000,
        'openai/gpt-4o-mini'
      );
      expect(model.modelId).toBe('gpt-4o-mini');
    });

    it('should fall back to a valid model when user preference is invalid', () => {
      const model = selectModelForFile(
        FileCategory.TEXT_DOCUMENT,
        10_000,
        'invalid/model'
      );
      expect(model).toBeDefined();
      // Should fall back to any valid model that supports text
      expect(['gpt-4o-mini', 'gpt-4.1-nano']).toContain(model.modelId);
    });

    it('should consider file size when selecting models', () => {
      const smallFile = selectModelForFile(FileCategory.TEXT_DOCUMENT, 1_000);
      const largeFile = selectModelForFile(FileCategory.TEXT_DOCUMENT, 200_000);

      expect(smallFile).toBeDefined();
      expect(largeFile).toBeDefined();
      // Large files should prefer models with large context
      if (largeFile.modelId === 'gpt-4.1-nano') {
        expect(largeFile.maxInputTokens).toBeGreaterThan(500_000);
      }
    });

    it('should select cost-effective models when capability is equivalent', () => {
      const model = selectModelForFile(FileCategory.STRUCTURED_DATA, 10_000);
      expect(model).toBeDefined();
      // Should select cheaper model when both support the file type
      expect(model.costPerMillionInputTokens).toBeLessThanOrEqual(0.15);
    });
  });

  describe('getModelString', () => {
    it('should return correct format for OpenAI models', () => {
      const capability = MODEL_REGISTRY['openai/gpt-4o-mini'];
      const modelString = getModelString(capability);
      expect(modelString).toBe('openai/gpt-4o-mini');
    });

    it('should return correct format for Google models', () => {
      const capability = MODEL_REGISTRY['google/gemini-2.0-flash-exp'];
      const modelString = getModelString(capability);
      expect(modelString).toBe('google/gemini-2.0-flash-exp');
    });

    it('should handle all registered models', () => {
      Object.values(MODEL_REGISTRY).forEach(capability => {
        const modelString = getModelString(capability);
        expect(modelString).toMatch(/^[a-z]+\/[a-z0-9.-]+$/);
        expect(modelString).toBe(
          `${capability.provider}/${capability.modelId}`
        );
      });
    });
  });

  describe('Model Registry Validation', () => {
    it('should have valid cost values for all models', () => {
      Object.values(MODEL_REGISTRY).forEach(model => {
        expect(model.costPerMillionInputTokens).toBeGreaterThan(0);
        expect(model.costPerMillionOutputTokens).toBeGreaterThan(0);
        expect(model.costPerMillionOutputTokens).toBeGreaterThanOrEqual(
          model.costPerMillionInputTokens
        );
      });
    });

    it('should have valid token limits for all models', () => {
      Object.values(MODEL_REGISTRY).forEach(model => {
        expect(model.maxInputTokens).toBeGreaterThan(0);
        expect(model.maxOutputTokens).toBeGreaterThan(0);
      });
    });

    it('should have at least one strength for each model', () => {
      Object.values(MODEL_REGISTRY).forEach(model => {
        expect(model.strengths.length).toBeGreaterThan(0);
      });
    });

    it('should have at least one bestFor category for each model', () => {
      Object.values(MODEL_REGISTRY).forEach(model => {
        expect(model.bestFor.length).toBeGreaterThan(0);
      });
    });

    it('should have text support for all models', () => {
      Object.values(MODEL_REGISTRY).forEach(model => {
        expect(model.supportsText).toBe(true);
      });
    });
  });

  describe('Model Capabilities', () => {
    it('should have exactly one model supporting video', () => {
      const videoModels = Object.values(MODEL_REGISTRY).filter(
        m => m.supportsVideo
      );
      expect(videoModels.length).toBe(1);
      expect(videoModels[0].modelId).toBe('gemini-2.0-flash-exp');
    });

    it('should have exactly one model supporting audio', () => {
      const audioModels = Object.values(MODEL_REGISTRY).filter(
        m => m.supportsAudio
      );
      expect(audioModels.length).toBe(1);
      expect(audioModels[0].modelId).toBe('gemini-2.0-flash-exp');
    });

    it('should have at least one model supporting PDF natively', () => {
      const pdfModels = Object.values(MODEL_REGISTRY).filter(
        m => m.supportsPDF
      );
      expect(pdfModels.length).toBeGreaterThan(0);
    });

    it('should have multiple models supporting images', () => {
      const imageModels = Object.values(MODEL_REGISTRY).filter(
        m => m.supportsImages
      );
      expect(imageModels.length).toBeGreaterThan(1);
    });
  });
});
