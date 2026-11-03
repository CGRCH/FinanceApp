export const DEFAULT_LOCK_TIMEOUT_MS = 60_000;

export const LOCK_TIMEOUT_OPTIONS_MS = [
  { label: '1 minuto', ms: 60_000 },
  { label: '5 minutos', ms: 300_000 },
  { label: '15 minutos', ms: 900_000 },
] as const;

export function normalizeLockTimeoutMs(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) return DEFAULT_LOCK_TIMEOUT_MS;
  return value;
}

/** Bloquear al volver del background si estuvo inactivo más que el umbral (0 = siempre al volver). */
export function shouldLockOnResume(
  backgroundedAtMs: number | null,
  nowMs: number,
  timeoutMs: number,
): boolean {
  if (backgroundedAtMs == null) return false;
  if (timeoutMs === 0) return true;
  return nowMs - backgroundedAtMs >= timeoutMs;
}
