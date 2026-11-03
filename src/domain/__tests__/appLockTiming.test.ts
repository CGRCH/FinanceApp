import {
  DEFAULT_LOCK_TIMEOUT_MS,
  normalizeLockTimeoutMs,
  shouldLockOnResume,
} from '../appLockTiming';

describe('appLockTiming', () => {
  it('normaliza timeout inválido', () => {
    expect(normalizeLockTimeoutMs(undefined)).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    expect(normalizeLockTimeoutMs(-1)).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    expect(normalizeLockTimeoutMs(120_000)).toBe(120_000);
  });

  it('bloquea al reanudar tras superar el umbral', () => {
    const bg = 1000;
    expect(shouldLockOnResume(bg, bg + 59_999, 60_000)).toBe(false);
    expect(shouldLockOnResume(bg, bg + 60_000, 60_000)).toBe(true);
    expect(shouldLockOnResume(null, bg + 120_000, 60_000)).toBe(false);
  });

  it('timeout cero bloquea siempre que hubo background', () => {
    expect(shouldLockOnResume(500, 501, 0)).toBe(true);
  });
});
