import { currentMonthKey } from '@/src/domain/money';

export type MonthEditability = 'editable' | 'closed' | 'future';

export function compareMonthKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Solo el mes calendario actual (dispositivo) es editable. */
export function monthEditability(monthKey: string, now = new Date()): MonthEditability {
  const current = currentMonthKey(now);
  const cmp = compareMonthKeys(monthKey, current);
  if (cmp < 0) return 'closed';
  if (cmp > 0) return 'future';
  return 'editable';
}

export function isMonthEditable(monthKey: string, now = new Date()): boolean {
  return monthEditability(monthKey, now) === 'editable';
}

export function monthEditabilityLabel(mode: MonthEditability): string {
  if (mode === 'closed') return 'Mes cerrado';
  if (mode === 'future') return 'Mes futuro';
  return 'Mes actual';
}

/** El mes elegido en UI no se reclampa al listado de meses con datos en SQLite. */
export function preserveSelectedMonthKey(selectedMonthKey: string, _persistedMonthKeys: string[]): string {
  return selectedMonthKey;
}
