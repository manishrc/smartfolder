![Vibe Coded](https://img.shields.io/badge/vibe-coded-A)

# smartfolder

`smartfolder` is a local CLI that watches folders and routes every file-system event through an AI workflow. Each folder carries its own instructions, tools, and throttling rules so you can automate chores such as labelling downloads, cleaning research notes, or triaging screenshots. Built on Vercel's AI SDK v6 beta with nine sandboxed file tools.

## Quick Start

Get started in seconds with npx:

```bash
# Grab a Vercel AI Gateway key and export it
export AI_GATEWAY_API_KEY="your-api-key-here"

# Launch the watcher against any folder
npx @manishrc/smartfolder ./downloads --prompt "Rename files descriptively"
```

Drop a file into `./downloads` and the AI will inspect, plan, and rename it in real time. Press `Ctrl+C` to stop the watcher. If you really don’t want to export the key, drop it once into `~/.smartfolder/token` (`echo "key" > ~/.smartfolder/token && chmod 600 ~/.smartfolder/token`)—but the env var is the default convention.

#### Example: Organize research notes

```bash
npx @manishrc/smartfolder ./notes --prompt "Summarize each document and rename it with a descriptive filename"
```

#### Example: Classify screenshots

```bash
npx @manishrc/smartfolder ./screenshots --prompt "Rename images based on what's shown in them"
```

#### Example: Process invoices

```bash
npx @manishrc/smartfolder ./invoices --prompt "Extract invoice number and date, rename to: Invoice-{date}-{number}.pdf"
```

## Status

- ✅ CLI contract, config format, and file-tool surface implemented
- ✅ Watchers, per-folder queues, and AI workflows operational
- ✅ Vercel AI SDK integration with multi-turn agent loops
- ✅ File metadata extraction (EXIF, PDF, file system)
- ✅ History logging and file modification tracking
- ⏭️ Packaging improvements and advanced tutorials

## CLI Usage

The watcher runs until you press `Ctrl+C`. New files are automatically processed as they arrive.

**Optional flags:**
- `--dry-run`: Preview what would happen without making changes
- `--run-once`: Reserved for future batch processing; today it simply exits after the initial scan and logs a TODO message
- `--verbose`: Show detailed logs

### AI Gateway Key

1. Visit the [Vercel AI Gateway API Keys page](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys%3Futm_source%3Dai_gateway_landing_page&title=Get+an+API+Key).
2. Sign in (or create an account) and generate a new key.
3. Export it so the CLI can read it every time:

   ```bash
   export AI_GATEWAY_API_KEY="your-api-key-here"
   ```

4. Optional fallback: save the key to `~/.smartfolder/token` if you prefer not to manage environment variables.

Smartfolder always looks for `AI_GATEWAY_API_KEY` first, then `~/.smartfolder/token`, then `ai.apiKey` inside your config file. Stick with the env var unless you have a specific reason not to.

**Other env vars:** `SMARTFOLDER_HOME` relocates Smartfolder’s config/state directory from `~/.smartfolder` to any custom path.

### Advanced: Multi-Folder Configuration

For multiple folders or custom AI settings, use a config file:

```bash
npx @manishrc/smartfolder run --config ./smartfolder.config.json
```

See the [Config File](#config-file) section below for details.

**Other commands:**
- `npx @manishrc/smartfolder validate --config ./smartfolder.config.json`: Validate your config without running
- `npx @manishrc/smartfolder --help`: Show all available options

**How it works:** The watcher monitors folders for new files (ignoring existing files on startup). When a file arrives, it's automatically analyzed by the AI with your prompt. Files modified by the AI are temporarily ignored to prevent loops. All activity is logged to your Smartfolder home directory (default `~/.smartfolder/state/<folder-hash>/history.jsonl`, or `$SMARTFOLDER_HOME/state/<folder-hash>/history.jsonl` if overridden).

## Config File

Configs are JSON (YAML support will be added later). A single config can describe multiple folders and optionally override default AI settings per folder. If you omit `--config`, the CLI will look for `~/.smartfolder/config.json` (or `$SMARTFOLDER_HOME/.smartfolder/config.json` when set) and use it as the project/global default.

```json
{
  "ai": {
    "provider": "vercel",
    "model": "openai/gpt-4o-mini",
    "apiKey": "$AI_GATEWAY_API_KEY",
    "temperature": 0.2,
    "maxToolCalls": 8,
    "defaultTools": ["read_file", "write_file", "rename_file", "move_file", "grep", "sed", "head", "tail", "create_folder"]
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
  - `apiKey`: resolved at runtime; supports `$ENV_VAR` expansion so configs can be committed safely. Falls back to `AI_GATEWAY_API_KEY` or `~/.smartfolder/token` if not specified.
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
- `move_file(from, to)`: moves an existing file or directory into a different subfolder (optionally renaming it) while keeping the file extension intact. Useful for classification pipelines that sort files into structured directories.
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

Each tool emits structured logs (tool id, duration, outcome) so you can audit how the agent touched your files. All tool calls are logged to the centralized history file under `~/.smartfolder/state/<folder-hash>/history.jsonl` (or `$SMARTFOLDER_HOME/state/<folder-hash>/history.jsonl`).

## Metadata Extraction

The system automatically extracts and includes file metadata in AI prompts:

- **File System Metadata**: Creation and modification dates (always available for all files)
- **EXIF Data** (Images): Camera make/model, date taken, GPS coordinates, ISO, aperture, exposure, focal length, lens model, dimensions, orientation, etc. (requires optional `exifr` package)
- **PDF Metadata**: Title, author, subject, creator, producer, creation/modification dates, page count (requires optional `pdf-parse` package)

**Optional Dependencies:**
To enable EXIF extraction for images: `npm install exifr`  
To enable PDF metadata extraction: `npm install pdf-parse`

If these packages are not installed, the system will work normally but without metadata extraction for those file types. Metadata is extracted automatically when available and included in the AI prompt.

## Development Setup

If you plan to extend Smartfolder itself (change code, run tests, etc.), clone the repository:

```bash
git clone https://github.com/manishrc/smartfolder.git
cd smartfolder
npm install    # installs deps and runs the tsdx build via `prepare`
npm test       # optional: run the unit tests
```

`npm install` runs the production build so `npx @manishrc/smartfolder` always executes the latest `dist/` output while you iterate.

## History & State Management

Smartfolder keeps its own state outside of your watched folders. By default everything lives under `~/.smartfolder`, but you can relocate it by pointing `SMARTFOLDER_HOME` at another directory.

For each watched folder the CLI creates a hashed directory at `~/.smartfolder/state/<folder-hash>/` (or `$SMARTFOLDER_HOME/state/<folder-hash>/`) that contains:
- **`history.jsonl`**: JSON Lines log of all workflow runs, including timestamps, files, tool invocations, and errors
- **`metadata.json`**: Information about the watched folder path, prompt preview, and timestamps to help resume sessions

Because logs live outside the watched folders there is nothing to clean up or ignore inside your project directories.

## Roadmap

- ✅ Core watcher/orchestrator pipeline
- ✅ Vercel AI SDK v6 beta integration with multi-turn agent loops
- ✅ File metadata extraction
- ✅ History logging
- ⏭️ Advanced patterns documentation
- ⏭️ Additional tools (`delete_file`, `call_shell`, user-defined adapters)

Have feedback or ideas for additional tools? Open an issue or start a discussion once the repo goes public.
