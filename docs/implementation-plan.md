# File Routing Architecture - Implementation Plan

## Overview

This document outlines the step-by-step implementation plan for enhancing SmartFolder's file routing architecture with:
- **Metadata-first approach** (always included)
- **Model-aware routing** (auto-select based on capabilities)
- **Content strategies** (full, partial, or metadata-only)
- **Cost optimization** (token usage minimization)

---

## Phase 1: Core Architecture (Foundation)

### 1.1 Create Type Definitions
**Files to create:**
- `src/types/FileCategory.ts` - File type enums and categories
- `src/types/FileMetadata.ts` - Metadata interfaces
- `src/types/FileContent.ts` - Content provider interfaces
- `src/types/ModelCapability.ts` - Model capability interfaces

**Implementation:**
```typescript
// src/types/FileCategory.ts
export enum FileCategory {
  TEXT_DOCUMENT = 'text_document',
  CODE_FILE = 'code_file',
  STRUCTURED_DATA = 'structured_data',
  IMAGE = 'image',
  PDF = 'pdf',
  AUDIO = 'audio',
  VIDEO = 'video',
  OFFICE_DOC = 'office_doc',
  ARCHIVE = 'archive',
  FOLDER = 'folder',
}

export enum ModelStrength {
  LARGE_CONTEXT = 'large_context',
  FAST_INFERENCE = 'fast_inference',
  COST_EFFECTIVE = 'cost_effective',
  IMAGE_ANALYSIS = 'image_analysis',
  VIDEO_ANALYSIS = 'video_analysis',
  AUDIO_ANALYSIS = 'audio_analysis',
  CODE_GENERATION = 'code_generation',
  STRUCTURED_OUTPUT = 'structured_output',
}
```

**Dependencies:** None

**Estimated Time:** 2 hours

---

### 1.2 Implement Model Capability Registry
**Files to create:**
- `src/models/ModelCapability.ts` - Capability interface
- `src/models/registry.ts` - Model registry with GPT-4o-mini, GPT-4.1-nano, Gemini 2.0 Flash
- `src/models/selector.ts` - Model selection logic

**Implementation:**
```typescript
// src/models/registry.ts
import { ModelCapability } from './ModelCapability';

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
    costPerMillionOutputTokens: 0.60,
    strengths: ['cost_effective', 'image_analysis', 'fast_inference'],
    bestFor: ['text_document', 'image', 'pdf', 'code_file'],
  },
  // ... other models
};

// src/models/selector.ts
export function selectModelForFile(
  category: FileCategory,
  fileSize: number,
  userPreference?: string
): ModelCapability {
  // Implementation as documented in behavior.md
}
```

**Dependencies:** Phase 1.1

**Estimated Time:** 4 hours

---

### 1.3 Create Content Provider Base Classes
**Files to create:**
- `src/providers/ContentProvider.ts` - Abstract base class
- `src/providers/ProviderFactory.ts` - Factory for creating providers

**Implementation:**
```typescript
// src/providers/ContentProvider.ts
export abstract class ContentProvider {
  constructor(
    protected watchedFolder: string,
    protected modelCapability: ModelCapability,
    protected thresholds: SizeThresholds
  ) {}

  async provideContent(filePath: string): Promise<FileContent> {
    const metadata = await this.extractMetadata(filePath);
    const size = metadata.size;

    const shouldSendContent = this.shouldSendContent(metadata, size);
    if (!shouldSendContent) {
      return {
        metadata,
        content: { type: 'none' },
        availableTools: this.getAvailableTools(metadata.category),
      };
    }

    const contentType = this.determineContentType(metadata, size);
    const content = await this.extractContent(filePath, contentType, metadata);

    return {
      metadata,
      content,
      availableTools: this.getAvailableTools(metadata.category),
    };
  }

  protected abstract extractMetadata(filePath: string): Promise<FileMetadata>;
  protected abstract shouldSendContent(metadata: FileMetadata, size: number): boolean;
  protected abstract determineContentType(metadata: FileMetadata, size: number): 'full' | 'partial';
  protected abstract extractContent(
    filePath: string,
    type: 'full' | 'partial',
    metadata: FileMetadata
  ): Promise<FileContent['content']>;
  protected abstract getAvailableTools(category: FileCategory): string[];
}
```

**Dependencies:** Phase 1.1

**Estimated Time:** 3 hours

---

## Phase 2: Metadata Extraction (Always-On)

### 2.1 Core Metadata Extractor
**Files to create:**
- `src/metadata/CoreMetadataExtractor.ts` - File system stats + hash

**Implementation:**
```typescript
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export class CoreMetadataExtractor {
  static async extract(filePath: string, watchedFolder: string): Promise<CoreMetadata> {
    const stats = await fs.stat(filePath);
    const hash = await this.calculateHash(filePath);

    return {
      path: filePath,
      relativePath: path.relative(watchedFolder, filePath),
      fileName: path.basename(filePath),
      extension: path.extname(filePath),
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      hash: {
        algorithm: 'sha256',
        value: hash,
      },
    };
  }

  private static async calculateHash(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
```

**Dependencies:** None

**Estimated Time:** 2 hours

---

### 2.2 Type-Specific Metadata Extractors
**Files to create:**
- `src/metadata/ExifExtractor.ts` - Image EXIF (uses exifr)
- `src/metadata/PDFExtractor.ts` - PDF metadata (uses pdf-parse)
- `src/metadata/AudioExtractor.ts` - Audio metadata (uses music-metadata)
- `src/metadata/VideoExtractor.ts` - Video metadata (uses fluent-ffmpeg)
- `src/metadata/ArchiveExtractor.ts` - Archive contents (uses node-stream-zip)
- `src/metadata/FolderExtractor.ts` - Folder analysis

**Implementation Example (EXIF):**
```typescript
export class ExifExtractor {
  static async extract(filePath: string): Promise<ExifMetadata | undefined> {
    try {
      const exifr = await import('exifr').catch(() => null);
      if (!exifr) {
        console.warn('exifr not installed, skipping EXIF extraction');
        return undefined;
      }

      return await exifr.parse(filePath, {
        pick: [
          'Make', 'Model', 'DateTimeOriginal', 'DateTime',
          'GPSLatitude', 'GPSLongitude', 'ImageWidth', 'ImageHeight',
          'Orientation', 'ISO', 'FNumber', 'ExposureTime', 'FocalLength',
        ],
      });
    } catch (error) {
      console.warn(`EXIF extraction failed for ${filePath}:`, error);
      return undefined;
    }
  }
}
```

**Dependencies:**
- `npm install exifr music-metadata fluent-ffmpeg node-stream-zip` (optional peer dependencies)

**Estimated Time:** 6 hours (all extractors)

---

## Phase 3: Content Providers (Type-Specific)

### 3.1 Text Content Provider
**File:** `src/providers/TextContentProvider.ts`

**Features:**
- Full content for files < 10KB
- Head + tail for files 10KB - 100KB
- Metadata only for files > 100KB
- CSV header preservation

**Dependencies:** Phase 1.3, 2.1

**Estimated Time:** 4 hours

---

### 3.2 Image Content Provider
**File:** `src/providers/ImageContentProvider.ts`

**Features:**
- EXIF metadata extraction
- Base64 encoding for AI
- Model capability check
- Size threshold enforcement

**Dependencies:** Phase 1.3, 2.1, 2.2 (ExifExtractor)

**Estimated Time:** 3 hours

---

### 3.3 PDF Content Provider
**File:** `src/providers/PDFContentProvider.ts`

**Features:**
- PDF metadata extraction
- Text extraction for non-native models
- Native PDF support for GPT-4o-mini
- Size-based routing

**Dependencies:** Phase 1.3, 2.1, 2.2 (PDFExtractor)

**Estimated Time:** 4 hours

---

### 3.4 Video Content Provider
**File:** `src/providers/VideoContentProvider.ts`

**Features:**
- Video metadata extraction (duration, resolution, codec)
- Route to Gemini 2.0 Flash if possible
- Metadata-only for non-supporting models
- Size threshold enforcement

**Dependencies:** Phase 1.3, 2.1, 2.2 (VideoExtractor)

**Estimated Time:** 3 hours

---

### 3.5 Audio Content Provider
**File:** `src/providers/AudioContentProvider.ts`

**Features:**
- Audio metadata extraction (artist, album, duration, bitrate)
- Route to Gemini 2.0 Flash if possible
- Metadata-only for non-supporting models

**Dependencies:** Phase 1.3, 2.1, 2.2 (AudioExtractor)

**Estimated Time:** 3 hours

---

### 3.6 Archive Content Provider
**File:** `src/providers/ArchiveContentProvider.ts`

**Features:**
- List archive contents
- Don't send binary to AI
- Provide file list in metadata

**Dependencies:** Phase 1.3, 2.1, 2.2 (ArchiveExtractor)

**Estimated Time:** 2 hours

---

### 3.7 Folder Content Provider
**File:** `src/providers/FolderContentProvider.ts`

**Features:**
- Count files and subfolders
- Calculate total size
- Analyze file type distribution
- No content sent (metadata only)

**Dependencies:** Phase 1.3, 2.1, 2.2 (FolderExtractor)

**Estimated Time:** 2 hours

---

## Phase 4: Integration with Orchestrator

### 4.1 Update File Classification
**File:** `src/workflow/orchestrator.ts`

**Changes:**
- Enhance `detectMimeType()` with more file types
- Add `classifyFile()` function to return `FileCategory`
- Update MIME type map with missing extensions

**Dependencies:** Phase 1.1

**Estimated Time:** 2 hours

---

### 4.2 Integrate Content Provider System
**File:** `src/workflow/orchestrator.ts`

**Changes:**
- Replace `buildFileEvent()` with content provider flow
- Use `ContentProviderFactory.createProvider()`
- Update `buildUserPrompt()` to work with `FileContent`

**Before:**
```typescript
async function buildFileEvent(filePath: string): Promise<FileEvent> {
  const stats = await fs.stat(filePath);
  return {
    path: filePath,
    relativePath: path.relative(folder.path, filePath),
    size: stats.size,
    mimeType: detectMimeType(filePath),
    // ...
  };
}
```

**After:**
```typescript
async function provideFileContent(filePath: string): Promise<FileContent> {
  const category = classifyFile(filePath);
  const model = selectModelForFile(category, size, folder.model);
  const provider = ContentProviderFactory.createProvider(
    category,
    model,
    folder.routing?.thresholds || DEFAULT_THRESHOLDS
  );
  return await provider.provideContent(filePath);
}
```

**Dependencies:** Phase 1.2, 1.3, 3.1-3.7

**Estimated Time:** 4 hours

---

### 4.3 Update Prompt Building
**File:** `src/workflow/orchestrator.ts`

**Changes:**
- Update `buildUserPrompt()` to use `FileContent`
- Always include metadata section
- Conditionally include content based on `content.type`
- Add "available tools" section

**Before:**
```typescript
const textPart = `A new file was added: ${event.relativePath}...`;
```

**After:**
```typescript
function buildPromptFromFileContent(fileContent: FileContent): string {
  let prompt = `A new file was detected:\n\n`;

  // Always include metadata
  prompt += `## File Metadata\n`;
  prompt += `- Path: ${fileContent.metadata.relativePath}\n`;
  prompt += `- Size: ${fileContent.metadata.size} bytes\n`;
  prompt += `- Type: ${fileContent.metadata.category}\n`;
  prompt += `- Created: ${fileContent.metadata.created}\n`;
  prompt += `- Modified: ${fileContent.metadata.modified}\n`;

  // Type-specific metadata
  if (fileContent.metadata.exif) {
    prompt += `\n## Image Metadata (EXIF)\n`;
    // ... format EXIF data
  }

  // Content (if provided)
  if (fileContent.content?.type === 'full') {
    prompt += `\n## File Content\n`;
    prompt += fileContent.content.data;
  } else if (fileContent.content?.type === 'partial') {
    prompt += `\n## File Content (Truncated)\n`;
    prompt += fileContent.content.data;
    prompt += `\n[${fileContent.content.truncation?.omittedSize} bytes omitted]\n`;
  } else {
    prompt += `\n## File Content\n`;
    prompt += `Content not included (file too large). Use available tools to inspect.\n`;
  }

  // Available tools
  prompt += `\n## Available Tools\n`;
  prompt += fileContent.availableTools.map(t => `- ${t}`).join('\n');

  return prompt;
}
```

**Dependencies:** Phase 4.2

**Estimated Time:** 3 hours

---

### 4.4 Integrate Model Selection
**File:** `src/workflow/aiClient.ts`

**Changes:**
- Use `selectModelForFile()` from Phase 1.2
- Dynamically create model with Vercel AI SDK's provider system
- Support auto-selection or user preference

**Before:**
```typescript
const model = openai(config.model || 'gpt-4o-mini');
```

**After:**
```typescript
import { generateText } from 'ai';

// AI SDK v6 - just pass the model string directly!
function selectModelStringForFile(
  fileContent: FileContent,
  userPreference?: string
): string {
  if (userPreference) {
    return userPreference;
  }

  const capability = selectModelForFile(
    fileContent.metadata.category,
    fileContent.metadata.size
  );

  // Return model string in 'provider/model' format
  return `${capability.provider}/${capability.modelId}`;
}

// Usage in workflow
const modelString = selectModelStringForFile(fileContent, config.model);

const result = await generateText({
  model: modelString,  // e.g., 'google/gemini-2.0-flash-exp'
  apiKey: config.apiKey,
  system: systemPrompt,
  prompt: userPrompt,
  tools: tools,
});
```

**Key Changes:**
- No provider imports needed (`@ai-sdk/openai`, `@ai-sdk/google`)
- Model passed as string directly: `'provider/model'`
- AI SDK v6 handles routing automatically

**Dependencies:** Phase 1.2, 4.2

**Estimated Time:** 3 hours

---

## Phase 5: Configuration Enhancements

### 5.1 Update Config Schema
**File:** `src/config.ts`

**Changes:**
- Add `routing` section to config
- Add per-folder threshold overrides
- Add model preferences by file type
- Add `autoSelectModel` flag

**New Schema:**
```typescript
interface SmartFolderConfig {
  ai: {
    apiKey: string;
    defaultModel?: string;  // Format: 'provider/model' (e.g., 'openai/gpt-4o-mini')
    autoSelectModel?: boolean;
    maxToolCalls?: number;
    temperature?: number;
  };

  routing?: {
    thresholds?: SizeThresholds;
    modelPreferences?: {
      [key in FileCategory]?: string;
    };
  };

  folders: Array<{
    path: string;
    prompt: string;
    tools?: string[];
    debounceMs?: number;
    handleFolders?: boolean;

    routing?: {
      autoSelectModel?: boolean;
      thresholds?: Partial<SizeThresholds>;
    };
  }>;
}
```

**Dependencies:** Phase 1.1

**Estimated Time:** 3 hours

---

### 5.2 Add Threshold Defaults
**File:** `src/config.ts`

**Implementation:**
```typescript
export const DEFAULT_THRESHOLDS: SizeThresholds = {
  text: {
    fullContentMax: 10 * 1024,
    partialContentMax: 100 * 1024,
    metadataOnlyAbove: 100 * 1024,
  },
  image: {
    fullContentMax: 5 * 1024 * 1024,
    metadataOnlyAbove: 5 * 1024 * 1024,
  },
  pdf: {
    fullContentMax: 10 * 1024 * 1024,
    metadataOnlyAbove: 10 * 1024 * 1024,
  },
  video: {
    fullContentMax: 20 * 1024 * 1024,
    metadataOnlyAbove: 20 * 1024 * 1024,
  },
  audio: {
    fullContentMax: 10 * 1024 * 1024,
    metadataOnlyAbove: 10 * 1024 * 1024,
  },
};
```

**Dependencies:** Phase 1.1

**Estimated Time:** 1 hour

---

## Phase 6: Folder Handling

### 6.1 Add Folder Watch Support
**File:** `src/watcher.ts`

**Changes:**
- Listen for `addDir` events from chokidar
- Emit folder events to orchestrator

**Before:**
```typescript
watcher.on('add', (filePath) => {
  // ... handle file
});
```

**After:**
```typescript
watcher.on('add', (filePath) => {
  // ... handle file
});

if (folder.handleFolders) {
  watcher.on('addDir', (folderPath) => {
    if (folderPath === folder.path) return; // Ignore root folder
    orchestrator.handleFolder(folderPath, folder);
  });
}
```

**Dependencies:** Phase 3.7

**Estimated Time:** 2 hours

---

### 6.2 Implement Folder Handler
**File:** `src/workflow/orchestrator.ts`

**Implementation:**
```typescript
async function handleFolder(
  folderPath: string,
  folderConfig: FolderConfig
): Promise<void> {
  const category = FileCategory.FOLDER;
  const model = selectModelForFile(category, 0, folderConfig.model);

  const provider = new FolderContentProvider(
    folderConfig.path,
    model,
    DEFAULT_THRESHOLDS
  );

  const fileContent = await provider.provideContent(folderPath);
  const prompt = buildPromptFromFileContent(fileContent);

  // Invoke AI workflow
  await invokeAIWorkflow(prompt, fileContent, folderConfig);
}
```

**Dependencies:** Phase 3.7, 4.2

**Estimated Time:** 2 hours

---

## Phase 7: Testing & Validation

### 7.1 Unit Tests
**Files to create:**
- `test/models/selector.test.ts` - Model selection logic
- `test/providers/TextContentProvider.test.ts`
- `test/providers/ImageContentProvider.test.ts`
- `test/metadata/ExifExtractor.test.ts`
- `test/metadata/AudioExtractor.test.ts`

**Coverage Goals:**
- Model selection for different file types
- Content provider decisions (full/partial/none)
- Metadata extraction (with and without optional libraries)
- Threshold enforcement

**Dependencies:** All phases

**Estimated Time:** 8 hours

---

### 7.2 Integration Tests
**Files to create:**
- `test/integration/download-organizer.test.ts` - Use case #1
- `test/integration/screenshot-organizer.test.ts` - Use case #2
- `test/integration/video-manager.test.ts` - Use case #5

**Test Approach:**
- Create test files in fixtures
- Trigger file watcher
- Verify correct model selection
- Verify correct content strategy
- Verify AI workflow execution

**Dependencies:** All phases

**Estimated Time:** 6 hours

---

### 7.3 End-to-End Tests
**Approach:**
- Set up real watched folders
- Add test files (PDF, image, video, audio)
- Verify organization, renaming, metadata usage
- Test with different models (GPT-4o-mini, Gemini)

**Dependencies:** All phases

**Estimated Time:** 4 hours

---

## Phase 8: Documentation & Polish

### 8.1 Update README
**File:** `README.md`

**Additions:**
- Document new routing configuration
- Add model capability table
- Add use case examples
- Document threshold configuration

**Dependencies:** All phases

**Estimated Time:** 2 hours

---

### 8.2 Add Migration Guide
**File:** `docs/migration-guide.md`

**Content:**
- How to upgrade from old version
- Config changes required
- New optional dependencies
- Breaking changes (if any)

**Dependencies:** All phases

**Estimated Time:** 2 hours

---

### 8.3 Create Developer Guide
**File:** `docs/developer-guide.md`

**Content:**
- Architecture overview
- How to add new file type support
- How to add new model to registry
- How to customize content providers

**Dependencies:** All phases

**Estimated Time:** 3 hours

---

## Summary

### Total Estimated Time: ~90 hours (~2-3 weeks)

### Phase Breakdown:
| Phase | Description | Time |
|-------|-------------|------|
| 1 | Core Architecture | 9 hours |
| 2 | Metadata Extraction | 8 hours |
| 3 | Content Providers | 21 hours |
| 4 | Orchestrator Integration | 12 hours |
| 5 | Configuration | 4 hours |
| 6 | Folder Handling | 4 hours |
| 7 | Testing | 18 hours |
| 8 | Documentation | 7 hours |

### Priority Levels:

**P0 (Critical - MVP):**
- Phase 1: Core Architecture
- Phase 2.1: Core Metadata
- Phase 3.1: Text Content Provider
- Phase 4.1-4.3: Basic Integration

**P1 (High - Full Feature Set):**
- Phase 2.2: Type-Specific Metadata
- Phase 3.2-3.3: Image & PDF Providers
- Phase 4.4: Model Selection
- Phase 5: Configuration

**P2 (Medium - Enhanced Features):**
- Phase 3.4-3.7: Video, Audio, Archive, Folder Providers
- Phase 6: Folder Handling
- Phase 7.1-7.2: Testing

**P3 (Low - Polish):**
- Phase 7.3: E2E Tests
- Phase 8: Documentation

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Set up project board** with tasks from each phase
3. **Install optional dependencies**: `npm install --save-optional exifr music-metadata fluent-ffmpeg node-stream-zip pdf-parse`
4. **Create feature branch**: `git checkout -b feature/file-routing-architecture`
5. **Start with Phase 1**: Core architecture and types
6. **Iterate**: Complete one phase at a time, testing as you go

---

**Plan Version**: 1.0
**Created**: 2025-01-17
**Status**: Ready for Implementation
