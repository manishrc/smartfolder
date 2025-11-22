import { TextContentProvider } from '../../src/providers/TextContentProvider';
import { MODEL_REGISTRY } from '../../src/models/registry';
import { DEFAULT_THRESHOLDS } from '../../src/config/thresholds';
import { FileCategory } from '../../src/types/FileCategory';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('TextContentProvider', () => {
  let tempDir: string;
  let provider: TextContentProvider;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smartfolder-test-'));
    provider = new TextContentProvider(
      tempDir,
      MODEL_REGISTRY['openai/gpt-4o-mini'],
      DEFAULT_THRESHOLDS
    );
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('extractMetadata', () => {
    it('should extract basic file metadata', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello, World!');

      const content = await provider.provideContent(filePath);

      expect(content.metadata).toBeDefined();
      expect(content.metadata.fileName).toBe('test.txt');
      expect(content.metadata.extension).toBe('.txt');
      expect(content.metadata.size).toBe(13);
      expect(content.metadata.category).toBe(FileCategory.TEXT_DOCUMENT);
      expect(content.metadata.relativePath).toBe('test.txt');
    });

    it('should include file hash', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello, World!');

      const content = await provider.provideContent(filePath);

      expect(content.metadata.hash).toBeDefined();
      expect(content.metadata.hash?.algorithm).toBe('sha256');
      expect(content.metadata.hash?.value).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should include creation and modification timestamps', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello, World!');

      const content = await provider.provideContent(filePath);

      expect(content.metadata.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(content.metadata.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Content Strategy', () => {
    it('should send full content for small files (<10KB)', async () => {
      const filePath = path.join(tempDir, 'small.txt');
      const content = 'This is a small file.';
      await fs.writeFile(filePath, content);

      const result = await provider.provideContent(filePath);

      expect(result.content?.type).toBe('full');
      expect(result.content?.data).toBe(content);
      expect(result.content?.format).toBe('text');
    });

    it('should send partial content for medium files (10KB-100KB)', async () => {
      const filePath = path.join(tempDir, 'medium.txt');
      // Create a file larger than 10KB
      const lines = Array(300).fill('This is line content that will repeat.');
      const content = lines.join('\n');
      await fs.writeFile(filePath, content);

      const result = await provider.provideContent(filePath);

      expect(result.content?.type).toBe('partial');
      expect(result.content?.format).toBe('text');
      expect(result.content?.truncation).toBeDefined();
      expect(result.content?.truncation?.strategy).toBe('head-tail');
    });

    it('should send metadata only for large files (>100KB)', async () => {
      const filePath = path.join(tempDir, 'large.txt');
      // Create a file larger than 100KB
      const lines = Array(3000).fill(
        'This is line content that will repeat to make the file large.'
      );
      const content = lines.join('\n');
      await fs.writeFile(filePath, content);

      const result = await provider.provideContent(filePath);

      // Should not send content for files over the metadata-only threshold
      expect(result.content?.type).toBe('none');
    });
  });

  describe('Head/Tail Truncation', () => {
    it('should include first 50 and last 50 lines for large files', async () => {
      const filePath = path.join(tempDir, 'truncate.txt');
      const lines = Array(200)
        .fill(null)
        .map((_, i) => `Line ${i + 1}`);
      await fs.writeFile(filePath, lines.join('\n'));

      const result = await provider.provideContent(filePath);

      expect(result.content?.type).toBe('partial');
      const data = result.content?.data as string;
      expect(data).toContain('Line 1');
      expect(data).toContain('Line 50');
      expect(data).toContain('Line 151'); // Last 50 lines start at 151
      expect(data).toContain('Line 200');
      expect(data).toContain('lines omitted');
    });

    it('should preserve CSV header separately', async () => {
      const filePath = path.join(tempDir, 'data.csv');
      const header = 'id,name,email,age';
      const rows = Array(200)
        .fill(null)
        .map((_, i) => `${i},User${i},user${i}@example.com,${20 + i}`);
      await fs.writeFile(filePath, [header, ...rows].join('\n'));

      const result = await provider.provideContent(filePath);

      expect(result.content?.type).toBe('partial');
      const data = result.content?.data as string;
      expect(data).toContain('=== CSV Header ===');
      expect(data).toContain(header);
    });
  });

  describe('Available Tools', () => {
    it('should include appropriate tools for text files', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Test content');

      const result = await provider.provideContent(filePath);

      expect(result.availableTools).toContain('read_file');
      expect(result.availableTools).toContain('write_file');
      expect(result.availableTools).toContain('rename_file');
      expect(result.availableTools).toContain('grep');
      expect(result.availableTools).toContain('sed');
      expect(result.availableTools).toContain('head');
      expect(result.availableTools).toContain('tail');
      expect(result.availableTools).toContain('create_folder');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty files', async () => {
      const filePath = path.join(tempDir, 'empty.txt');
      await fs.writeFile(filePath, '');

      const result = await provider.provideContent(filePath);

      expect(result.metadata.size).toBe(0);
      expect(result.content?.type).toBe('full');
      expect(result.content?.data).toBe('');
    });

    it('should handle files with special characters', async () => {
      const filePath = path.join(tempDir, 'special.txt');
      const content = 'Hello\nWorld\t!\r\n€ © ® ™';
      await fs.writeFile(filePath, content);

      const result = await provider.provideContent(filePath);

      expect(result.content?.type).toBe('full');
      expect(result.content?.data).toBe(content);
    });

    it('should handle files with only newlines', async () => {
      const filePath = path.join(tempDir, 'newlines.txt');
      await fs.writeFile(filePath, '\n\n\n\n\n');

      const result = await provider.provideContent(filePath);

      expect(result.content?.type).toBe('full');
      expect(result.content?.data).toBe('\n\n\n\n\n');
    });

    it('should handle files at exactly the threshold', async () => {
      const filePath = path.join(tempDir, 'threshold.txt');
      const content = 'a'.repeat(10 * 1024); // Exactly 10KB
      await fs.writeFile(filePath, content);

      const result = await provider.provideContent(filePath);

      expect(result.content?.type).toBe('full');
    });

    it('should handle files just over the threshold', async () => {
      const filePath = path.join(tempDir, 'over-threshold.txt');
      const content = 'a'.repeat(10 * 1024 + 1); // 10KB + 1 byte
      await fs.writeFile(filePath, content);

      const result = await provider.provideContent(filePath);

      expect(result.content?.type).toBe('partial');
    });
  });
});
