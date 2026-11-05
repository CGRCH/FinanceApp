import {
  attemptGate,
  failuresAfterSuccess,
  failuresAfterWrongAttempt,
  lockoutDelayMs,
  PIN_FAILURES_BEFORE_DELAY,
} from '../appLockAttempts';

describe('appLockAttempts', () => {
  it('no demora antes del umbral', () => {
    expect(PIN_FAILURES_BEFORE_DELAY).toBe(5);
    expect(lockoutDelayMs(4)).toBe(0);
    expect(lockoutDelayMs(5)).toBe(30_000);
    expect(lockoutDelayMs(6)).toBe(60_000);
    expect(lockoutDelayMs(7)).toBe(120_000);
  });

  it('bloquea intentos hasta cumplir la demora', () => {
    const t0 = 1_000_000;
    const afterFive = failuresAfterWrongAttempt(4, t0);
    expect(afterFive.failureCount).toBe(5);
    const gate = attemptGate(afterFive.failureCount, afterFive.lastFailureAtMs, t0 + 10_000);
    expect(gate.allowed).toBe(false);
    expect(gate.remainingMs).toBe(20_000);
    const ok = attemptGate(afterFive.failureCount, afterFive.lastFailureAtMs, t0 + 30_000);
    expect(ok.allowed).toBe(true);
  });

  it('reinicia contador tras éxito', () => {
    expect(failuresAfterSuccess()).toEqual({ failureCount: 0, lastFailureAtMs: null });
  });
});
