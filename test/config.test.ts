import path from 'path';

import { loadConfig } from '../src/config';

const fixturePath = path.join(__dirname, 'fixtures', 'basic.config.json');

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TEST_SMARTFOLDER_KEY = 'sk-test-123';
    process.env.TEST_FOLDER_SECRET = 'folder-secret-456';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('loads config files and normalizes folder paths', async () => {
    const config = await loadConfig(fixturePath, { dryRun: true });

    expect(config.ai.model).toBe('openai/gpt-4o-mini');
    expect(config.ai.apiKey).toBe('sk-test-123');
    expect(config.folders).toHaveLength(1);

    const folder = config.folders[0];
    expect(path.isAbsolute(folder.path)).toBe(true);
    expect(path.isAbsolute(folder.stateDir)).toBe(true);
    expect(path.basename(folder.stateDir)).toBe('.smartfolder');
    expect(path.dirname(folder.historyLogPath)).toBe(folder.stateDir);
    expect(folder.debounceMs).toBe(750);
    expect(folder.env.TOPIC).toBe('agents');
    expect(folder.env.SECRET_LABEL).toBe('folder-secret-456');
    expect(folder.dryRun).toBe(true);
    expect(folder.tools).toEqual(['read_file', 'write_file']);
    expect(folder.ignore).toContain('**/.smartfolder/**');
  });
});
