import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ensureModelSelection, waitForAssistantResponse, uploadAttachmentFile } from '../../src/browser/pageActions.js';
import type { ChromeClient } from '../../src/browser/types.js';

const logger = vi.fn();

beforeEach(() => {
  logger.mockClear();
});

describe('ensureModelSelection', () => {
  test('logs when model already selected', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: { status: 'already-selected', label: 'ChatGPT 5.1' } } }),
    } as unknown as ChromeClient['Runtime'];
    await expect(ensureModelSelection(runtime, 'ChatGPT 5.1', logger)).resolves.toBeUndefined();
    expect(logger).toHaveBeenCalledWith('Model picker: ChatGPT 5.1');
  });

  test('throws when option missing', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: { status: 'option-not-found' } } }),
    } as unknown as ChromeClient['Runtime'];
    await expect(ensureModelSelection(runtime, 'GPT-5 Pro', logger)).rejects.toThrow(
      /Unable to find model option matching/,
    );
  });

  test('throws when button missing', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: { status: 'button-missing' } } }),
    } as unknown as ChromeClient['Runtime'];
    await expect(ensureModelSelection(runtime, 'Instant', logger)).rejects.toThrow(
      /Unable to locate the ChatGPT model selector button/,
    );
  });
});

describe('waitForAssistantResponse', () => {
  test('returns captured assistant payload', async () => {
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: {
          type: 'object',
          value: { text: 'Answer', html: '<p>Answer</p>', messageId: 'mid', turnId: 'tid' },
        },
      }),
    } as unknown as ChromeClient['Runtime'];
    const result = await waitForAssistantResponse(runtime, 1000, logger);
    expect(result.text).toBe('Answer');
    expect(result.meta).toEqual({ messageId: 'mid', turnId: 'tid' });
  });
});

describe('uploadAttachmentFile', () => {
  test('selects DOM input and uploads file', async () => {
    logger.mockClear();
    const dom = {
      getDocument: vi.fn().mockResolvedValue({ root: { nodeId: 1 } }),
      querySelector: vi.fn().mockResolvedValue({ nodeId: 2 }),
      setFileInputFiles: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChromeClient['DOM'];
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: { matched: true } } }),
    } as unknown as ChromeClient['Runtime'];
    await expect(uploadAttachmentFile({ runtime, dom }, '/tmp/foo.md', logger)).resolves.toBeUndefined();
    expect(dom.querySelector).toHaveBeenCalled();
    expect(dom.setFileInputFiles).toHaveBeenCalledWith({ nodeId: 2, files: ['/tmp/foo.md'] });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('Attachment queued'));
  });

  test('throws when file input missing', async () => {
    const dom = {
      getDocument: vi.fn().mockResolvedValue({ root: { nodeId: 1 } }),
      querySelector: vi.fn().mockResolvedValue({ nodeId: 0 }),
    } as unknown as ChromeClient['DOM'];
    const runtime = {
      evaluate: vi.fn(),
    } as unknown as ChromeClient['Runtime'];
    await expect(uploadAttachmentFile({ runtime, dom }, '/tmp/foo.md', logger)).rejects.toThrow(
      /unable to locate.*attachment input/i,
    );
  });
});
