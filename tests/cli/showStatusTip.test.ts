import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockListSessionsMetadata = vi.fn();
const mockFilterSessionsByRange = vi.fn();

vi.mock('../../src/sessionManager.ts', () => ({
  listSessionsMetadata: mockListSessionsMetadata,
  filterSessionsByRange: mockFilterSessionsByRange,
  readSessionLog: vi.fn(),
  readSessionMetadata: vi.fn(),
  // biome-ignore lint/style/useNamingConvention: must match exported constant name
  SESSIONS_DIR: '/tmp/.oracle/sessions',
  wait: vi.fn(),
}));

describe('showStatus cleanup tip', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockListSessionsMetadata.mockResolvedValue([]);
    mockFilterSessionsByRange.mockReturnValue({ entries: [], truncated: false, total: 0 });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('prints cleanup tip when no sessions found', async () => {
    const { showStatus } = await import('../../src/cli/sessionDisplay.ts');
    await showStatus({ hours: 24, includeAll: false, limit: 10, showExamples: false });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('oracle session --clear'));
  }, 15_000);
});
