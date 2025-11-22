# Configuration Examples

## Basic Configuration with Vercel AI Gateway

Vercel AI Gateway automatically routes requests when you use the `provider/model` format. No custom URL configuration needed!

> **Token note:** Examples below reference `$AI_GATEWAY_API_KEY`, which matches Vercel’s default naming. All flows fall back to the shared `~/.smartfolder/token` file if the env var is not set.

### Example 1: Simple Download Organizer

```json
{
  "ai": {
    "apiKey": "$AI_GATEWAY_API_KEY",
    "defaultModel": "openai/gpt-4o-mini",
    "maxToolCalls": 10,
    "temperature": 0.7
  },

  "folders": [
    {
      "path": "./downloads",
      "prompt": "Organize downloads by file type into appropriate folders",
      "tools": ["read_file", "rename_file", "move_file", "create_folder"],
      "debounceMs": 1000
    }
  ]
}
```

**How it works:**
- The `"defaultModel": "openai/gpt-4o-mini"` format is passed directly to AI SDK v6
- AI SDK v6 automatically routes to the correct provider (OpenAI in this case)
- No provider imports, no `gateway` field, no `baseURL` needed!
- Just the model string and API key

---

### Example 2: Auto-Select Model Based on File Type

```json
{
  "ai": {
    "apiKey": "$AI_GATEWAY_API_KEY",
    "autoSelectModel": true,
    "maxToolCalls": 10
  },

  "routing": {
    "modelPreferences": {
      "video": "google/gemini-2.0-flash-exp",
      "audio": "google/gemini-2.0-flash-exp",
      "pdf": "openai/gpt-4o-mini",
      "text_document": "openai/gpt-4.1-nano",
      "image": "openai/gpt-4o-mini"
    },

    "thresholds": {
      "text": {
        "fullContentMax": 10240,
        "partialContentMax": 102400,
        "metadataOnlyAbove": 102400
      },
      "image": {
        "fullContentMax": 5242880,
        "metadataOnlyAbove": 5242880
      },
      "video": {
        "fullContentMax": 20971520,
        "metadataOnlyAbove": 20971520
      }
    }
  },

  "folders": [
    {
      "path": "./media",
      "prompt": "Organize media files by type, date, and content",
      "tools": ["rename_file", "move_file", "create_folder"],
      "handleFolders": true
    }
  ]
}
```

**How it works:**
- `autoSelectModel: true` enables automatic model selection
- System picks best model based on file type (video → Gemini, PDF → GPT-4o-mini)
- All models use `provider/model` format
- AI SDK v6 passes the model string directly - automatic provider routing

---

### Example 3: Multiple Folders with Different Models

```json
{
  "ai": {
    "apiKey": "$AI_GATEWAY_API_KEY",
    "defaultModel": "openai/gpt-4o-mini"
  },

  "folders": [
    {
      "path": "./downloads",
      "prompt": "Organize downloads by file type",
      "model": "openai/gpt-4o-mini",
      "tools": ["read_file", "rename_file", "move_file", "create_folder"]
    },
    {
      "path": "./videos",
      "prompt": "Organize videos by content and create descriptive names",
      "model": "google/gemini-2.0-flash-exp",
      "tools": ["rename_file", "move_file", "create_folder"]
    },
    {
      "path": "./code",
      "prompt": "Organize code files by language and project",
      "model": "openai/gpt-4.1-nano",
      "tools": ["read_file", "grep", "rename_file", "move_file", "create_folder"],
      "routing": {
        "thresholds": {
          "text": {
            "fullContentMax": 20480,
            "partialContentMax": 204800
          }
        }
      }
    }
  ]
}
```

**How it works:**
- Each folder can specify its own model
- Downloads folder uses GPT-4o-mini (good for PDFs and images)
- Videos folder uses Gemini 2.0 Flash (native video support)
- Code folder uses GPT-4.1-nano (large context for code, cost-effective)
- Code folder has custom thresholds (larger files OK)

---

### Example 4: Cost-Optimized Configuration

```json
{
  "ai": {
    "apiKey": "$AI_GATEWAY_API_KEY",
    "autoSelectModel": true
  },

  "routing": {
    "modelPreferences": {
      "text_document": "openai/gpt-4.1-nano",
      "code_file": "openai/gpt-4.1-nano",
      "structured_data": "openai/gpt-4.1-nano",
      "image": "openai/gpt-4o-mini",
      "pdf": "openai/gpt-4o-mini",
      "video": "google/gemini-2.0-flash-exp",
      "audio": "google/gemini-2.0-flash-exp"
    },

    "thresholds": {
      "text": {
        "fullContentMax": 5120,
        "partialContentMax": 51200,
        "metadataOnlyAbove": 102400
      },
      "image": {
        "fullContentMax": 2097152,
        "metadataOnlyAbove": 5242880
      },
      "video": {
        "fullContentMax": 10485760,
        "metadataOnlyAbove": 20971520
      }
    }
  },

  "folders": [
    {
      "path": "./to-organize",
      "prompt": "Organize files efficiently",
      "tools": ["rename_file", "move_file", "create_folder"]
    }
  ]
}
```

**Cost optimization strategies:**
- Use GPT-4.1-nano for text (cheapest: $0.10/M input tokens)
- Use Gemini 2.0 Flash for video/audio (cheapest multimodal: $0.075/M)
- Lower thresholds = less content sent = fewer tokens
- Metadata-only for large files
- No expensive read_file/grep tools (only move/rename)

**Savings:**
- Text files: 93% reduction (5KB vs 100KB threshold)
- Images: 60% reduction (2MB vs 5MB threshold)
- Videos: 50% reduction (10MB vs 20MB threshold)
- Model selection: 150x cheaper for text (nano vs GPT-4)

---

## Model Strings Reference

All models use the `provider/model` format - just pass them directly to AI SDK v6:

### OpenAI Models
```
"openai/gpt-4o-mini"        // Best for: Images, PDFs, general tasks
"openai/gpt-4.1-nano"       // Best for: Large text, code, cost-sensitive
"openai/gpt-4o"             // Best for: Complex tasks (expensive)
```

### Google Models
```
"google/gemini-2.0-flash-exp"     // Best for: Video, audio, multimodal
"google/gemini-1.5-pro"           // Best for: Long context, complex
```

### Anthropic Models (if supported)
```
"anthropic/claude-3-5-sonnet"     // Best for: Code, reasoning
"anthropic/claude-3-haiku"        // Best for: Fast, cost-effective
```

---

## Environment Variables

Store your API key in environment variables:

```bash
# .env file
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key_here
```

Then reference in config:
```json
{
  "ai": {
    "apiKey": "$AI_GATEWAY_API_KEY"
  }
}
```

---

## Model Auto-Selection Logic

When `autoSelectModel: true`, the system scores models based on:

1. **Native support** (highest priority)
   - Video file + Gemini = +100 points
   - PDF file + GPT-4o-mini = +50 points
   - Image file + any vision model = +50 points

2. **Cost efficiency**
   - Lower cost/million tokens = higher score
   - GPT-4.1-nano gets bonus for being cheapest

3. **Context window** (for large files)
   - Files >50KB + 1M context models = +20 points

4. **Fallback**
   - If no preference specified, defaults to `openai/gpt-4o-mini`

**Example scoring:**
```
File: video.mp4 (15MB)

google/gemini-2.0-flash-exp:
  + 100 (native video support)
  + 13.3 (cost: 1/0.075 * 10)
  = 113.3 points ✅ WINNER

openai/gpt-4o-mini:
  + 0 (no video support)
  + 6.7 (cost: 1/0.15 * 10)
  = 6.7 points

Decision: Use Gemini 2.0 Flash
```

---

## Best Practices

### 1. Use Auto-Selection for Mixed Content
```json
{
  "ai": {
    "autoSelectModel": true
  }
}
```

### 2. Override for Specific Folders
```json
{
  "folders": [
    {
      "path": "./videos",
      "model": "google/gemini-2.0-flash-exp"  // Force Gemini for videos
    }
  ]
}
```

### 3. Set Conservative Thresholds for Cost Control
```json
{
  "routing": {
    "thresholds": {
      "text": { "fullContentMax": 5120 }  // 5KB instead of 10KB
    }
  }
}
```

### 4. Use Metadata-Only for Large Binary Files
```json
{
  "routing": {
    "thresholds": {
      "video": {
        "fullContentMax": 10485760,      // 10MB
        "metadataOnlyAbove": 10485760    // Above 10MB = metadata only
      }
    }
  }
}
```

### 5. Model Selection by Use Case

**Download Organizer:**
- `openai/gpt-4o-mini` (handles PDFs, images well)

**Photo Library:**
- `openai/gpt-4o-mini` or `openai/gpt-4.1-nano` (both support images)

**Video Manager:**
- `google/gemini-2.0-flash-exp` (ONLY model with native video)

**Code Projects:**
- `openai/gpt-4.1-nano` (large context, cheap)

**Music Library:**
- `google/gemini-2.0-flash-exp` (native audio support)

---

## Migration from Old Config

If you have an old config with custom gateway URLs:

### Old (Cloudflare/Custom Gateway)
```json
{
  "ai": {
    "apiKey": "...",
    "gateway": "https://gateway.ai.cloudflare.com/v1/account/smartfolder",
    "model": "gpt-4o-mini"
  }
}
```

### New (Vercel AI Gateway)
```json
{
  "ai": {
    "apiKey": "...",
    "defaultModel": "openai/gpt-4o-mini"
  }
}
```

**Changes:**
1. Remove `gateway` field (not needed)
2. Change `model` to `defaultModel`
3. Update model string to include provider: `"openai/gpt-4o-mini"`

That's it! Vercel AI Gateway handles the routing automatically.
