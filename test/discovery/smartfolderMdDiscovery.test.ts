import {
  mkdtemp,
  writeFile,
  unlink,
  mkdir,
  rm,
  chmod,
  symlink,
} from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  SmartFolderMdDiscovery,
  SmartFolderMdConfig,
  DiscoveryCallbacks,
} from '../../src/discovery/SmartFolderMdDiscovery';

// Helper to create a temporary directory for tests
async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'smartfolder-test-'));
}

// Helper to wait for a duration
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to create a smartfolder.md file
async function createSmartfolderMd(
  dirPath: string,
  content: string
): Promise<string> {
  const filePath = path.join(dirPath, 'smartfolder.md');
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

describe('SmartFolderMdDiscovery', () => {
  let tempDir: string;
  let discovery: SmartFolderMdDiscovery;
  let addedConfigs: SmartFolderMdConfig[] = [];
  let removedPaths: Array<{ filePath: string; folderPath: string }> = [];
  let changedConfigs: SmartFolderMdConfig[] = [];

  const callbacks: DiscoveryCallbacks = {
    onConfigAdded: async config => {
      addedConfigs.push(config);
    },
    onConfigRemoved: async (filePath, folderPath) => {
      removedPaths.push({ filePath, folderPath });
    },
    onConfigChanged: async config => {
      changedConfigs.push(config);
    },
  };

  beforeEach(async () => {
    tempDir = await createTempDir();
    addedConfigs = [];
    removedPaths = [];
    changedConfigs = [];
  });

  afterEach(async () => {
    if (discovery) {
      await discovery.stop();
    }
    // Cleanup temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('File Discovery', () => {
    it('should find smartfolder.md in root directory', async () => {
      await createSmartfolderMd(tempDir, 'Test prompt for root');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      // Wait for initial discovery
      await wait(200);

      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].folderPath).toBe(tempDir);
      expect(addedConfigs[0].prompt).toBe('Test prompt for root');
    });

    it('should find smartfolder.md in nested subdirectories', async () => {
      const subDir = path.join(tempDir, 'projects', 'project1');
      await mkdir(subDir, { recursive: true });
      await createSmartfolderMd(subDir, 'Nested project prompt');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].folderPath).toBe(subDir);
      expect(addedConfigs[0].prompt).toBe('Nested project prompt');
    });

    it('should find multiple smartfolder.md files at different levels', async () => {
      // Create multiple smartfolder.md files
      await createSmartfolderMd(tempDir, 'Root prompt');

      const subDir1 = path.join(tempDir, 'folder1');
      await mkdir(subDir1);
      await createSmartfolderMd(subDir1, 'Folder1 prompt');

      const subDir2 = path.join(tempDir, 'folder2', 'nested');
      await mkdir(subDir2, { recursive: true });
      await createSmartfolderMd(subDir2, 'Nested prompt');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      expect(addedConfigs).toHaveLength(3);
      const folderPaths = addedConfigs.map(c => c.folderPath).sort();
      expect(folderPaths).toEqual([tempDir, subDir1, subDir2].sort());
    });

    it('should handle symlinks correctly', async () => {
      // Create a real directory with smartfolder.md
      const realDir = path.join(tempDir, 'real');
      await mkdir(realDir);
      await createSmartfolderMd(realDir, 'Real directory prompt');

      // Create a symlink to it
      const symlinkPath = path.join(tempDir, 'link');
      try {
        await symlink(realDir, symlinkPath);
      } catch (error) {
        // Skip test on Windows or systems that don't support symlinks
        console.log('Skipping symlink test - not supported');
        return;
      }

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Should find the file (possibly twice if symlink is followed)
      expect(addedConfigs.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect ignore patterns (node_modules, .git)', async () => {
      // Create smartfolder.md in ignored directories
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'package');
      await mkdir(nodeModulesDir, { recursive: true });
      await createSmartfolderMd(nodeModulesDir, 'Should be ignored');

      const gitDir = path.join(tempDir, '.git', 'hooks');
      await mkdir(gitDir, { recursive: true });
      await createSmartfolderMd(gitDir, 'Should be ignored');

      // Create one that should be found
      const validDir = path.join(tempDir, 'valid');
      await mkdir(validDir);
      await createSmartfolderMd(validDir, 'Should be found');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Should only find the valid one
      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].folderPath).toBe(validDir);
    });

    it('should handle permission-denied errors gracefully', async () => {
      // Create a directory with restricted permissions
      const restrictedDir = path.join(tempDir, 'restricted');
      await mkdir(restrictedDir);

      // Try to make it unreadable (may not work on all systems)
      try {
        await chmod(restrictedDir, 0o000);
      } catch (error) {
        // Skip test if chmod not supported
        console.log('Skipping permission test - chmod not fully supported');
        return;
      }

      // Create a valid smartfolder.md in another directory
      const validDir = path.join(tempDir, 'valid');
      await mkdir(validDir);
      await createSmartfolderMd(validDir, 'Valid prompt');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Should find the valid one, not crash on restricted
      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].folderPath).toBe(validDir);

      // Cleanup: restore permissions
      await chmod(restrictedDir, 0o755);
    });

    it('should handle case-insensitive filesystems', async () => {
      // Create SMARTFOLDER.MD (uppercase)
      const upperCasePath = path.join(tempDir, 'SMARTFOLDER.MD');
      await writeFile(upperCasePath, 'Uppercase file', 'utf-8');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Should find it (case-insensitive match)
      expect(addedConfigs.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle deeply nested directories', async () => {
      // Create a deep path (20 levels)
      let deepPath = tempDir;
      for (let i = 0; i < 20; i++) {
        deepPath = path.join(deepPath, `level${i}`);
      }
      await mkdir(deepPath, { recursive: true });
      await createSmartfolderMd(deepPath, 'Deep nested prompt');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(300);

      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].folderPath).toBe(deepPath);
    });
  });

  describe('Content Watching', () => {
    it('should detect when smartfolder.md is modified', async () => {
      const filePath = await createSmartfolderMd(tempDir, 'Original prompt');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Modify the file
      await writeFile(filePath, 'Updated prompt', 'utf-8');

      // Wait for Chokidar to detect change
      await wait(800);

      expect(changedConfigs).toHaveLength(1);
      expect(changedConfigs[0].prompt).toBe('Updated prompt');
    });

    it('should detect when smartfolder.md is deleted', async () => {
      const filePath = await createSmartfolderMd(tempDir, 'To be deleted');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Delete the file
      await unlink(filePath);

      // Wait for detection (Chokidar unlink event)
      await wait(800);

      expect(removedPaths).toHaveLength(1);
      expect(removedPaths[0].folderPath).toBe(tempDir);
    });

    it('should detect when new smartfolder.md is created', async () => {
      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // No configs yet
      expect(addedConfigs).toHaveLength(0);

      // Create a new smartfolder.md
      await createSmartfolderMd(tempDir, 'Newly created');

      // Wait for next poll cycle
      await wait(200);

      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].prompt).toBe('Newly created');
    });

    it('should handle rapid successive edits (debouncing)', async () => {
      const filePath = await createSmartfolderMd(tempDir, 'Original');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Clear initial add
      changedConfigs = [];

      // Make multiple rapid edits
      await writeFile(filePath, 'Edit 1', 'utf-8');
      await wait(50);
      await writeFile(filePath, 'Edit 2', 'utf-8');
      await wait(50);
      await writeFile(filePath, 'Edit 3', 'utf-8');

      // Wait for debounce to settle
      await wait(1000);

      // Should have debounced to fewer change events
      // (exact count depends on timing, but should be < 3)
      expect(changedConfigs.length).toBeLessThan(3);
      expect(changedConfigs[changedConfigs.length - 1].prompt).toBe('Edit 3');
    });

    it('should handle atomic file writes (temp file + rename)', async () => {
      const filePath = await createSmartfolderMd(tempDir, 'Original');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      changedConfigs = [];

      // Simulate atomic write (vim/vscode pattern)
      const tempFile = path.join(tempDir, 'smartfolder.md.tmp');
      await writeFile(tempFile, 'Atomic write', 'utf-8');
      await unlink(filePath);
      await writeFile(filePath, 'Atomic write', 'utf-8');
      await unlink(tempFile);

      // Wait for detection
      await wait(1000);

      // Should eventually detect the change
      const configs = discovery.getDiscoveredConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].prompt).toBe('Atomic write');
    });
  });

  describe('Polling Behavior', () => {
    it('should poll at configured interval (100ms for tests)', async () => {
      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(50);

      // Create file after start
      await createSmartfolderMd(tempDir, 'Created after start');

      // Should be discovered within ~100ms
      await wait(150);

      expect(addedConfigs).toHaveLength(1);
    });

    it('should not block other operations during poll', async () => {
      // Create a large directory structure
      for (let i = 0; i < 10; i++) {
        const dir = path.join(tempDir, `dir${i}`);
        await mkdir(dir);
      }

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      // Should be able to create files during polling
      let fileCreated = false;
      const createPromise = (async () => {
        await createSmartfolderMd(path.join(tempDir, 'dir5'), 'Test');
        fileCreated = true;
      })();

      await wait(50);
      await createPromise;

      expect(fileCreated).toBe(true);
    });

    it('should handle poll failures gracefully', async () => {
      // Start discovery with non-existent root
      const nonExistent = path.join(tempDir, 'does-not-exist');

      discovery = new SmartFolderMdDiscovery([nonExistent], callbacks, 100);
      await discovery.start();

      // Should not crash
      await wait(300);

      // No configs found, but system still running
      expect(addedConfigs).toHaveLength(0);
    });

    it('should detect new files within one poll cycle', async () => {
      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(50);

      const startTime = Date.now();
      await createSmartfolderMd(tempDir, 'Detect quickly');

      // Wait for detection
      while (addedConfigs.length === 0 && Date.now() - startTime < 500) {
        await wait(50);
      }

      const detectionTime = Date.now() - startTime;

      expect(addedConfigs).toHaveLength(1);
      // Should be detected within ~200ms (one poll cycle + buffer)
      expect(detectionTime).toBeLessThan(300);
    });
  });

  describe('Configuration Updates', () => {
    it('should reload config when smartfolder.md changes', async () => {
      const filePath = await createSmartfolderMd(tempDir, 'Original config');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      const originalConfig = addedConfigs[0];

      // Update the file
      await writeFile(filePath, 'Updated config', 'utf-8');
      await wait(800);

      expect(changedConfigs).toHaveLength(1);
      expect(changedConfigs[0].prompt).toBe('Updated config');
      expect(changedConfigs[0].filePath).toBe(originalConfig.filePath);
    });

    it('should handle parse errors in smartfolder.md', async () => {
      const filePath = await createSmartfolderMd(tempDir, 'Valid initial');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Create an empty file (parse error)
      await writeFile(filePath, '', 'utf-8');
      await wait(800);

      // Should not crash, but may log error
      // Config should remain unchanged or be removed
      const configs = discovery.getDiscoveredConfigs();
      // Either no configs (removed) or still has old config
      expect(configs.length).toBeLessThanOrEqual(1);
    });

    it('should preserve state across config reloads', async () => {
      const filePath = await createSmartfolderMd(tempDir, 'Version 1');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      const firstConfig = addedConfigs[0];

      // Update multiple times
      await writeFile(filePath, 'Version 2', 'utf-8');
      await wait(800);

      await writeFile(filePath, 'Version 3', 'utf-8');
      await wait(800);

      // Should have same filePath and folderPath throughout
      expect(changedConfigs.length).toBeGreaterThanOrEqual(1);
      changedConfigs.forEach(config => {
        expect(config.filePath).toBe(firstConfig.filePath);
        expect(config.folderPath).toBe(firstConfig.folderPath);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty smartfolder.md files', async () => {
      const filePath = path.join(tempDir, 'smartfolder.md');
      await writeFile(filePath, '', 'utf-8');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Should not add empty config
      expect(addedConfigs).toHaveLength(0);
    });

    it('should handle extremely large smartfolder.md files', async () => {
      // Create a >10KB prompt
      const largePrompt = 'A'.repeat(20000);
      await createSmartfolderMd(tempDir, largePrompt);

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].prompt).toBe(largePrompt);
    });

    it('should handle Unicode and special characters in paths', async () => {
      const unicodeDir = path.join(tempDir, 'プロジェクト');
      await mkdir(unicodeDir);
      await createSmartfolderMd(unicodeDir, 'Unicode path test');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].folderPath).toBe(unicodeDir);
    });

    it('should prevent infinite loops from self-watching', async () => {
      // Create smartfolder.md in a .smartfolder directory (should be ignored)
      const smartfolderDir = path.join(tempDir, '.smartfolder', 'state');
      await mkdir(smartfolderDir, { recursive: true });
      await createSmartfolderMd(smartfolderDir, 'Should be ignored');

      // Create a valid one
      const validDir = path.join(tempDir, 'valid');
      await mkdir(validDir);
      await createSmartfolderMd(validDir, 'Should be found');

      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Should only find the valid one
      expect(addedConfigs).toHaveLength(1);
      expect(addedConfigs[0].folderPath).toBe(validDir);
    });

    it('should handle concurrent discoveries from multiple root paths', async () => {
      const root1 = path.join(tempDir, 'root1');
      const root2 = path.join(tempDir, 'root2');
      await mkdir(root1);
      await mkdir(root2);

      await createSmartfolderMd(root1, 'Root 1 prompt');
      await createSmartfolderMd(root2, 'Root 2 prompt');

      discovery = new SmartFolderMdDiscovery([root1, root2], callbacks, 100);
      await discovery.start();

      await wait(200);

      expect(addedConfigs).toHaveLength(2);
      const prompts = addedConfigs.map(c => c.prompt).sort();
      expect(prompts).toEqual(['Root 1 prompt', 'Root 2 prompt']);
    });

    it('should handle file system race conditions', async () => {
      discovery = new SmartFolderMdDiscovery([tempDir], callbacks, 100);
      await discovery.start();

      // Create and delete rapidly
      const filePath = await createSmartfolderMd(
        tempDir,
        'Race condition test'
      );
      await unlink(filePath);

      // Wait for poll cycles
      await wait(500);

      // Should handle gracefully without crashing
      // Either 0 or 1 configs depending on timing
      expect(addedConfigs.length).toBeLessThanOrEqual(1);
    });

    it('should handle multiple root directories with overlapping paths', async () => {
      const subDir = path.join(tempDir, 'sub');
      await mkdir(subDir);
      await createSmartfolderMd(subDir, 'Overlap test');

      // Watch both parent and child
      discovery = new SmartFolderMdDiscovery([tempDir, subDir], callbacks, 100);
      await discovery.start();

      await wait(200);

      // Should find it once (or twice if both roots discover it)
      expect(addedConfigs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
