/** Montos en pesos chilenos como enteros (sin decimales). */
export function formatClp(amountClp: number): string {
  const sign = amountClp < 0 ? '-$' : '$';
  return `${sign}${Math.abs(amountClp).toLocaleString('es-CL')}`;
}

export function parseClpInput(raw: string): number | null {
  const cleaned = raw.replace(/\$/g, '').replace(/\./g, '').replace(/\s/g, '').trim();
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  if (Number.isNaN(n)) return null;
  return n;
}

export function currentMonthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}
