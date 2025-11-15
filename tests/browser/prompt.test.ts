import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { assembleBrowserPrompt } from '../../src/browser/prompt.js';
import { DEFAULT_SYSTEM_PROMPT } from '../../src/oracle.js';
import type { RunOracleOptions } from '../../src/oracle.js';

function buildOptions(overrides: Partial<RunOracleOptions> = {}): RunOracleOptions {
  return {
    prompt: overrides.prompt ?? 'Explain the bug',
    model: overrides.model ?? 'gpt-5-pro',
    file: overrides.file ?? ['a.txt'],
    system: overrides.system,
  } as RunOracleOptions;
}

describe('assembleBrowserPrompt', () => {
  const cleanupPaths: string[] = [];

  async function cleanup() {
    while (cleanupPaths.length > 0) {
      const file = cleanupPaths.pop();
      if (file) {
        await fs.rm(file, { force: true }).catch(() => undefined);
      }
    }
  }

  afterEach(async () => {
    await cleanup();
  });

  test('builds markdown bundle with system/user/file blocks', async () => {
    const options = buildOptions();
    const result = await assembleBrowserPrompt(options, {
      cwd: '/repo',
      readFilesImpl: async () => [{ path: '/repo/a.txt', content: 'console.log("hi")\n' }],
    });
    expect(result.markdown).toContain('[SYSTEM]');
    expect(result.markdown).toContain('[USER]');
    expect(result.markdown).toContain('[FILE: a.txt]');
    expect(result.composerText).toContain(DEFAULT_SYSTEM_PROMPT);
    expect(result.composerText).toContain('Explain the bug');
    expect(result.composerText).not.toContain('[FILE:');
    expect(result.estimatedInputTokens).toBeGreaterThan(0);
    expect(result.attachmentFilePath).toBeTruthy();
    if (result.attachmentFilePath) {
      cleanupPaths.push(result.attachmentFilePath);
      const contents = await fs.readFile(result.attachmentFilePath, 'utf8');
      expect(contents).toContain('[FILE: a.txt]');
      expect(contents).toContain('console.log("hi")');
    }
  });

  test('respects custom cwd and multiple files', async () => {
    const options = buildOptions({ file: ['docs/one.md', 'docs/two.md'] });
    const result = await assembleBrowserPrompt(options, {
      cwd: '/root/project',
      readFilesImpl: async (paths) =>
        paths.map((entry, index) => ({ path: path.resolve('/root/project', entry), content: `file-${index}` })),
    });
    expect(result.markdown).toContain('[FILE: docs/one.md]');
    expect(result.markdown).toContain('[FILE: docs/two.md]');
    expect(result.composerText).not.toContain('[FILE: docs/one.md]');
    expect(result.composerText).not.toContain('[FILE: docs/two.md]');
    expect(result.attachmentFilePath).toBeTruthy();
    if (result.attachmentFilePath) {
      cleanupPaths.push(result.attachmentFilePath);
      const contents = await fs.readFile(result.attachmentFilePath, 'utf8');
      expect(contents).toContain('[FILE: docs/one.md]');
      expect(contents).toContain('[FILE: docs/two.md]');
    }
  });
});
