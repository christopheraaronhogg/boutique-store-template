import { describe, expect, it } from 'vitest';
import { SEAL_RING_LENGTH, sealTextFit } from '../src/lib/seal';

describe('award seal text', () => {
  it('stretches the text exactly around the ring', () => {
    expect(sealTextFit('BEST OF NORTHEAST ARKANSAS · 2026 ·').textLength).toBe(SEAL_RING_LENGTH);
  });

  it('keeps the usual award at full size', () => {
    expect(sealTextFit('BEST OF NORTHEAST ARKANSAS · 2026 ·').fontSize).toBe(10.5);
  });

  it('shrinks long award text so every letter still fits', () => {
    const { fontSize, letterSpacing } = sealTextFit('BEST OF NORTHEAST ARKANSAS · READERS CHOICE 2026 ·');
    expect(fontSize).toBeLessThan(10.5);
    expect(50 * (fontSize * 0.62 + letterSpacing)).toBeLessThanOrEqual(SEAL_RING_LENGTH + 1);
  });
});
