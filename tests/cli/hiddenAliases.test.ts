import { describe, expect, test, vi } from 'vitest';
import { applyHiddenAliases } from '../../src/cli/hiddenAliases.js';

describe('applyHiddenAliases', () => {
  test('maps --mode to engine when engine not set', () => {
    const setOptionValue = vi.fn();
    const opts = { mode: 'browser' } as any;

    applyHiddenAliases(opts, setOptionValue);

    expect(opts.engine).toBe('browser');
    expect(setOptionValue).toHaveBeenCalledWith('engine', 'browser');
  });

  test('does not override explicit engine', () => {
    const setOptionValue = vi.fn();
    const opts = { mode: 'browser', engine: 'api' } as any;

    applyHiddenAliases(opts, setOptionValue);

    expect(opts.engine).toBe('api');
    expect(setOptionValue).not.toHaveBeenCalledWith('engine', expect.anything());
  });
});
