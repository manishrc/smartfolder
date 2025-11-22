/**
 * Security-focused tests for the security fixes
 */

import { loadInlineConfig } from '../src/config';

describe('Security Fixes', () => {
  describe('Environment Variable Whitelist (H-3)', () => {
    it('should reject non-whitelisted environment variables', () => {
      expect(() => {
        loadInlineConfig({
          ai: {
            apiKey: '$MALICIOUS_ENV_VAR',
          },
          folders: [
            {
              path: '/tmp/test',
              prompt: 'test',
            },
          ],
        });
      }).toThrow(/MALICIOUS_ENV_VAR.*is not allowed/);
    });

    it('should allow whitelisted environment variables', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const config = loadInlineConfig({
        ai: {
          apiKey: '$OPENAI_API_KEY',
        },
        folders: [
          {
            path: '/tmp/test',
            prompt: 'test',
          },
        ],
      });
      expect(config.ai.apiKey).toBe('test-key');
      delete process.env.OPENAI_API_KEY;
    });

    it('should reject multiple non-whitelisted env vars in folder config', () => {
      expect(() => {
        loadInlineConfig({
          folders: [
            {
              path: '/tmp/test',
              prompt: 'test',
              env: {
                MALICIOUS_VAR: '$ATTACKER_ENV',
              },
            },
          ],
        });
      }).toThrow(/ATTACKER_ENV.*is not allowed/);
    });
  });
});
