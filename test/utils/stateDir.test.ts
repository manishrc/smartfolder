import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import {
  getSmartFolderHome,
  hashFolderPath,
  getStateDirForFolder,
  getHistoryLogPath,
  getMetadataPath,
  ensureFolderMetadata,
  FolderStateMetadata,
} from '../../src/utils/stateDir';

describe('stateDir utilities', () => {
  const originalEnv = process.env.SMARTFOLDER_HOME;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smartfolder-stateDir-test-'));
  });

  afterEach(async () => {
    // Restore environment
    if (originalEnv) {
      process.env.SMARTFOLDER_HOME = originalEnv;
    } else {
      delete process.env.SMARTFOLDER_HOME;
    }

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('getSmartFolderHome', () => {
    it('should return SMARTFOLDER_HOME env var if set', () => {
      process.env.SMARTFOLDER_HOME = '/custom/path';
      expect(getSmartFolderHome()).toBe(path.resolve('/custom/path'));
    });

    it('should return ~/.smartfolder if SMARTFOLDER_HOME not set', () => {
      delete process.env.SMARTFOLDER_HOME;
      expect(getSmartFolderHome()).toBe(path.join(os.homedir(), '.smartfolder'));
    });
  });

  describe('hashFolderPath', () => {
    it('should generate consistent hash for same path', () => {
      const folderPath = '/path/to/folder';
      const hash1 = hashFolderPath(folderPath);
      const hash2 = hashFolderPath(folderPath);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different paths', () => {
      const hash1 = hashFolderPath('/path/to/folder1');
      const hash2 = hashFolderPath('/path/to/folder2');
      expect(hash1).not.toBe(hash2);
    });

    it('should generate 16-character hash', () => {
      const hash = hashFolderPath('/path/to/folder');
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should normalize paths before hashing', () => {
      const hash1 = hashFolderPath('/path/to/folder');
      const hash2 = hashFolderPath('/path/to/folder/');
      const hash3 = hashFolderPath('/path/to/./folder');
      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
    });
  });

  describe('getStateDirForFolder', () => {
    it('should return path under ~/.smartfolder/state/{hash}/', () => {
      const folderPath = '/path/to/watched/folder';
      const stateDir = getStateDirForFolder(folderPath);
      const hash = hashFolderPath(folderPath);

      expect(stateDir).toContain('.smartfolder');
      expect(stateDir).toContain('state');
      expect(stateDir).toContain(hash);
      expect(stateDir).toBe(path.join(getSmartFolderHome(), 'state', hash));
    });
  });

  describe('getHistoryLogPath', () => {
    it('should return path to history.jsonl in state dir', () => {
      const folderPath = '/path/to/watched/folder';
      const historyPath = getHistoryLogPath(folderPath);

      expect(historyPath).toContain('history.jsonl');
      expect(historyPath).toBe(
        path.join(getStateDirForFolder(folderPath), 'history.jsonl')
      );
    });
  });

  describe('getMetadataPath', () => {
    it('should return path to metadata.json in state dir', () => {
      const folderPath = '/path/to/watched/folder';
      const metadataPath = getMetadataPath(folderPath);

      expect(metadataPath).toContain('metadata.json');
      expect(metadataPath).toBe(
        path.join(getStateDirForFolder(folderPath), 'metadata.json')
      );
    });
  });

  describe('ensureFolderMetadata', () => {
    beforeEach(() => {
      process.env.SMARTFOLDER_HOME = tempDir;
    });

    it('should create new metadata file for first run', async () => {
      const folderPath = path.join(tempDir, 'watched');
      await fs.mkdir(folderPath, { recursive: true });

      const stateDir = getStateDirForFolder(folderPath);
      await fs.mkdir(stateDir, { recursive: true });

      await ensureFolderMetadata(folderPath, 'Test prompt');

      const metadataPath = getMetadataPath(folderPath);
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata: FolderStateMetadata = JSON.parse(content);

      expect(metadata.folderPath).toBe(path.resolve(folderPath));
      expect(metadata.hash).toBe(hashFolderPath(folderPath));
      expect(metadata.firstWatchedAt).toBeDefined();
      expect(metadata.lastRunAt).toBeDefined();
      expect(metadata.prompt).toBe('Test prompt');
    });

    it('should update existing metadata on subsequent runs', async () => {
      const folderPath = path.join(tempDir, 'watched');
      await fs.mkdir(folderPath, { recursive: true });

      const stateDir = getStateDirForFolder(folderPath);
      await fs.mkdir(stateDir, { recursive: true });

      // First run
      await ensureFolderMetadata(folderPath, 'First prompt');
      const metadataPath = getMetadataPath(folderPath);
      const firstContent = await fs.readFile(metadataPath, 'utf-8');
      const firstMetadata: FolderStateMetadata = JSON.parse(firstContent);

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second run
      await ensureFolderMetadata(folderPath, 'Updated prompt');
      const secondContent = await fs.readFile(metadataPath, 'utf-8');
      const secondMetadata: FolderStateMetadata = JSON.parse(secondContent);

      // Should keep same firstWatchedAt
      expect(secondMetadata.firstWatchedAt).toBe(firstMetadata.firstWatchedAt);
      // Should update lastRunAt
      expect(secondMetadata.lastRunAt).not.toBe(firstMetadata.lastRunAt);
      // Should update prompt
      expect(secondMetadata.prompt).toBe('Updated prompt');
    });

    it('should handle missing prompt parameter', async () => {
      const folderPath = path.join(tempDir, 'watched');
      await fs.mkdir(folderPath, { recursive: true });

      const stateDir = getStateDirForFolder(folderPath);
      await fs.mkdir(stateDir, { recursive: true });

      await ensureFolderMetadata(folderPath);

      const metadataPath = getMetadataPath(folderPath);
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata: FolderStateMetadata = JSON.parse(content);

      expect(metadata.prompt).toBeUndefined();
    });
  });
});
