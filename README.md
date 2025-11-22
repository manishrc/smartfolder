# smartfolder

`smartfolder` is a local CLI that watches folders and routes every file-system event through an AI workflow. Each folder carries its own instructions, tools, and throttling rules so you can automate chores such as labelling downloads, cleaning research notes, or triaging screenshots. Built on Vercel's AI SDK v6 beta with eight sandboxed file tools.

## Status

- ✅ CLI contract, config format, and file-tool surface implemented
- ✅ Watchers, per-folder queues, and AI workflows operational
- ✅ Vercel AI SDK integration with multi-turn agent loops
- ✅ File metadata extraction (EXIF, PDF, file system)
- ✅ History logging and file modification tracking
- ⏭️ Packaging improvements and advanced tutorials

## Installation

Since this package is not yet published to npm, you'll need to clone and build it locally:

```bash
# Clone the repository
git clone <repository-url>
cd smartfolder

# Install dependencies
npm install

# Build the project
npm run build
```

**Running the CLI:**

After building, you can run the CLI in several ways:

1. **Using node directly (simplest):**
   ```bash
   node bin/smartfolder.js ./downloads --prompt "Rename files descriptively"
   ```

2. **Using npm link (for global access):**
   ```bash
   npm link
   smartfolder ./downloads --prompt "Rename files descriptively"
   ```
   
   This creates a global symlink so you can use `smartfolder` from anywhere.

The CLI targets Node 18+ and expects an AI key via `AI_GATEWAY_API_KEY` or `ai.apiKey` in your config before invoking any workflow. 

**Getting Your API Key:**

To use Vercel AI Gateway, you'll need to get an API key:

1. Go to the [Vercel AI Gateway API Keys page](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys%3Futm_source%3Dai_gateway_landing_page&title=Get+an+API+Key)
2. Sign in to your Vercel account (or create one if you don't have one)
3. Create a new API key for your team/project
4. Copy the API key and set it as an environment variable:

   ```bash
   export AI_GATEWAY_API_KEY="your-api-key-here"
   ```

   Or add it to your shell profile (`.bashrc`, `.zshrc`, etc.) to make it persistent.

**Environment Variables:**
- `AI_GATEWAY_API_KEY`: Vercel AI Gateway API key (required for AI workflows)
- `SMARTFOLDER_HOME`: Override the default home directory (defaults to `~/.smartfolder`)

## CLI Usage

### Quick Start

Point `smartfolder` at any folder with a simple prompt and watch it work:

```bash
# If using npm link (recommended for development)
smartfolder ./downloads --prompt "Rename files to descriptive kebab-case names based on their content"

# Or using node directly
node bin/smartfolder.js ./downloads --prompt "Rename files to descriptive kebab-case names based on their content"
```

That's it! Drop a file into `./downloads` and watch the AI analyze it and rename it intelligently. No config file needed.

**Try it yourself:**
```bash
# Organize research notes
node bin/smartfolder.js ./notes --prompt "Summarize each document and rename it with a descriptive filename"

# Classify screenshots
node bin/smartfolder.js ./screenshots --prompt "Rename images based on what's shown in them"

# Process invoices
node bin/smartfolder.js ./invoices --prompt "Extract invoice number and date, rename to: Invoice-{date}-{number}.pdf"
```

The watcher runs until you press `Ctrl+C`. New files are automatically processed as they arrive.

**Optional flags:**
- `--dry-run`: Preview what would happen without making changes
- `--run-once`: Process existing files and exit (useful for one-time cleanup)
- `--verbose`: Show detailed logs

### Advanced: Multi-Folder Configuration

For multiple folders or custom AI settings, use a config file:

```bash
# If using npm link
smartfolder run --config ./smartfolder.config.json

# Or using node directly
node bin/smartfolder.js run --config ./smartfolder.config.json
```

See the [Config File](#config-file) section below for details.

**Other commands:**
- `node bin/smartfolder.js validate --config ./smartfolder.config.json`: Validate your config without running
- `node bin/smartfolder.js --help`: Show all available options

**How it works:** The watcher monitors folders for new files (ignoring existing files on startup). When a file arrives, it's automatically analyzed by the AI with your prompt. Files modified by the AI are temporarily ignored to prevent loops. All activity is logged to `{folder}/.smartfolder/history.jsonl`.

## Config File

Configs are JSON (YAML support will be added later). A single config can describe multiple folders and optionally override default AI settings per folder. If you omit `--config`, the CLI will look for `~/.smartfolder/config.json` (override with `SMARTFOLDER_HOME`) and use it as the project/global default.

```json
{
  "ai": {
    "provider": "vercel",
    "model": "openai/gpt-4o-mini",
    "apiKey": "$AI_GATEWAY_API_KEY",
    "temperature": 0.2,
    "maxToolCalls": 8,
    "defaultTools": ["read_file", "write_file", "rename_file", "grep", "sed", "head", "tail", "create_folder"]
  },
  "folders": [
    {
      "path": "./notes",
      "prompt": "You are an organized research assistant...",
      "tools": ["read_file", "write_file"],
      "ignore": ["**/.git/**", "**/*.tmp"],
      "debounceMs": 2000,
      "pollIntervalMs": 500,
      "env": {
        "TOPIC": "AI Agents"
      }
    },
    {
      "path": "./downloads",
      "prompt": "Classify and rename incoming files using kebab-case.",
      "tools": ["read_file", "rename_file"],
      "dryRun": true
    }
  ]
}
```

### Top-level keys

- `ai`: defaults for every folder.
  - `provider`: currently `vercel` (Vercel AI Gateway only).
  - `model`: model identifier in the format `provider/model-name` (e.g., `openai/gpt-4o-mini`). The SDK automatically routes through Vercel AI Gateway.
  - `apiKey`: resolved at runtime; supports `$ENV_VAR` expansion so configs can be committed safely. Uses `AI_GATEWAY_API_KEY` environment variable if not specified.
  - `temperature`, `maxToolCalls`: sampling + safety limits for the agent.
  - `defaultTools`: the baseline toolset; folders can override or append.
- `folders`: array describing each watched directory.

### Folder-level keys

- `path`: absolute or relative to the config file; must exist before the watcher starts.
- `prompt`: system instructions for the AI agent handling this folder.
- `tools`: subset of registered tool ids. Unknown ids fail validation.
- `ignore`: glob patterns passed to the watcher (micromatch syntax).
- `debounceMs`: minimum quiet time before launching a workflow after events burst.
- `pollIntervalMs`: fs polling interval for platforms where native events are flaky.
- `env`: arbitrary key/value bag injected into the AI context.
- `dryRun`: overrides the CLI-level flag so a folder can permanently simulate actions.

## Built-in Tools

Tools are exposed to the AI through Vercel's AI SDK v6 beta tool-calling interface. All tools sandbox paths so they cannot escape the configured folder.

**Text File Tools** (for UTF-8 text files only):
- `read_file(path)`: reads UTF-8 text at `path`. Rejects binary files (PDFs, images, etc.) and files >256 KB. Binary files are automatically passed as file parts to the AI.
- `write_file(path, contents)`: creates a new file with `contents`. Fails if the file already exists, ensuring AI never overwrites user data. Parent directories are created as needed. Cannot be used for binary files.
- `rename_file(from, to)`: renames or moves a file within the folder boundaries. **MUST preserve the original file extension**. Fails when `to` already exists or points outside the folder. This is the primary tool for renaming newly added files.
- `grep(path, pattern, caseInsensitive?)`: searches for a pattern in a text file, returns matching lines with line numbers (up to 100 matches).
- `sed(path, find, replace, caseInsensitive?)`: performs find-and-replace operations on text files. All occurrences are replaced.
- `head(path, lines?)`: reads the first N lines of a text file (defaults to 10).
- `tail(path, lines?)`: reads the last N lines of a text file (defaults to 10).

**Directory Tools**:
- `create_folder(path)`: creates a new directory within the watched folder. Parent directories are created automatically if needed.

**File Handling:**
- **Binary files** (PDFs, images, videos, etc.): Automatically sent as file parts to the AI. The AI can analyze them directly without using `read_file`.
- **Text files ≤10KB**: Full content is included in the prompt.
- **Text files >10KB**: Automatically truncated to first 50 and last 50 lines (for CSV files, the header row is preserved separately).

Each tool emits structured logs (tool id, duration, outcome) so you can audit how the agent touched your files. All tool calls are logged to `{folder}/.smartfolder/history.jsonl`.

## Metadata Extraction

The system automatically extracts and includes file metadata in AI prompts:

- **File System Metadata**: Creation and modification dates (always available for all files)
- **EXIF Data** (Images): Camera make/model, date taken, GPS coordinates, ISO, aperture, exposure, focal length, lens model, dimensions, orientation, etc. (requires optional `exifr` package)
- **PDF Metadata**: Title, author, subject, creator, producer, creation/modification dates, page count (requires optional `pdf-parse` package)

**Optional Dependencies:**
To enable EXIF extraction for images: `npm install exifr`  
To enable PDF metadata extraction: `npm install pdf-parse`

If these packages are not installed, the system will work normally but without metadata extraction for those file types. Metadata is extracted automatically when available and included in the AI prompt.

## History & State Management

Each folder gets an internal `.smartfolder/` directory automatically. The CLI uses it for:
- **`history.jsonl`**: JSON Lines log of all workflow runs, including timestamps, file names, results, and errors
- State tracking to prevent infinite loops (files modified by AI are temporarily ignored)

The `.smartfolder/` directory is automatically ignored by watchers, so you never have to configure or clean it manually.

## Roadmap

- ✅ Core watcher/orchestrator pipeline
- ✅ Vercel AI SDK v6 beta integration with multi-turn agent loops
- ✅ File metadata extraction
- ✅ History logging
- ⏭️ Advanced patterns documentation
- ⏭️ Additional tools (`delete_file`, `call_shell`, user-defined adapters)

Have feedback or ideas for additional tools? Open an issue or start a discussion once the repo goes public.
