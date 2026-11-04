/** Valores que expo-sqlite puede devolver como string en nativo. */
export function coerceSqliteInteger(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const cleaned = value.replace(/\./g, '').replace(/,/g, '').trim();
    if (!cleaned) return fallback;
    const n = Number.parseInt(cleaned, 10);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

export function coerceSqliteBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function coerceSplitDivisor(value: unknown): number | null {
  const n = coerceSqliteInteger(value, NaN);
  if (!Number.isFinite(n) || n < 2) return null;
  return n;
}

export function coerceClpAmount(value: unknown): number {
  return Math.max(0, coerceSqliteInteger(value, 0));
}
