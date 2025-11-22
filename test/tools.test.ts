import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { FileToolRegistry } from '../src/tools/fileTools';
import { FolderConfig } from '../src/config';
import { logger } from '../src/logger';

function createFolderConfig(root: string): FolderConfig {
  return {
    path: root,
    prompt: 'Test folder',
    tools: ['read_file', 'write_file', 'rename_file'],
    ignore: [],
    debounceMs: 100,
    pollIntervalMs: undefined,
    env: {},
    dryRun: false,
    stateDir: path.join(root, '.smartfolder'),
    historyLogPath: path.join(root, '.smartfolder', 'history.jsonl'),
  };
}

describe('FileToolRegistry', () => {
  let tempDir: string;
  let folder: FolderConfig;
  const registry = new FileToolRegistry();

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smartfolder-tools-'));
    folder = createFolderConfig(tempDir);
    await fs.mkdir(folder.stateDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('skips write_file during dry run', async () => {
    const result = await registry.invokeTool(
      'write_file',
      { path: 'dry-run.txt', contents: 'hello world' },
      { folder, logger, dryRun: true }
    );
    expect(result.success).toBe(true);
    await expect(
      fs.stat(path.join(folder.path, 'dry-run.txt'))
    ).rejects.toThrow();
  });

  it('creates files with write_file and refuses overwrite', async () => {
    const target = 'notes/output.txt';
    await registry.invokeTool(
      'write_file',
      { path: target, contents: 'data' },
      { folder, logger, dryRun: false }
    );
    const stats = await fs.stat(path.join(folder.path, target));
    expect(stats.isFile()).toBe(true);
    await expect(
      registry.invokeTool(
        'write_file',
        { path: target, contents: 'new-data' },
        { folder, logger, dryRun: false }
      )
    ).resolves.toMatchObject({ success: false });
  });

  it('prevents escaping folder boundaries', async () => {
    await expect(
      registry.invokeTool(
        'read_file',
        { path: '../etc/passwd' },
        { folder, logger, dryRun: false }
      )
    ).resolves.toMatchObject({ success: false });
  });
});
