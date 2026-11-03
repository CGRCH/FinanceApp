/** Tras esta cantidad de intentos fallidos consecutivos aplica demora. */
export const PIN_FAILURES_BEFORE_DELAY = 5;

/** Demora tras el 5.º fallo: 30 s; desde el 6.º: 1 min por cada fallo extra. */
export function lockoutDelayMs(failureCount: number): number {
  if (failureCount < PIN_FAILURES_BEFORE_DELAY) return 0;
  const tier = failureCount - PIN_FAILURES_BEFORE_DELAY;
  if (tier === 0) return 30_000;
  return 60_000 * tier;
}

export function attemptGate(
  failureCount: number,
  lastFailureAtMs: number | null,
  nowMs: number,
): { allowed: boolean; remainingMs: number } {
  const delay = lockoutDelayMs(failureCount);
  if (delay === 0) return { allowed: true, remainingMs: 0 };
  if (lastFailureAtMs == null) return { allowed: true, remainingMs: 0 };
  const elapsed = nowMs - lastFailureAtMs;
  if (elapsed >= delay) return { allowed: true, remainingMs: 0 };
  return { allowed: false, remainingMs: delay - elapsed };
}

export function failuresAfterSuccess(): { failureCount: number; lastFailureAtMs: null } {
  return { failureCount: 0, lastFailureAtMs: null };
}

export function failuresAfterWrongAttempt(
  failureCount: number,
  nowMs: number,
): { failureCount: number; lastFailureAtMs: number } {
  return { failureCount: failureCount + 1, lastFailureAtMs: nowMs };
}
