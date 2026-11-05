import { coerceClpAmount, coerceSqliteInteger } from './sqliteCoerce';

export function yourShareClp(totalClp: number, people: number): number {
  const total = coerceClpAmount(totalClp);
  const divisor = Math.max(1, coerceSqliteInteger(people, 1));
  return Math.round(total / divisor);
}

export function totalFromYourShareClp(share: number, people: number): number {
  const divisor = Math.max(1, coerceSqliteInteger(people, 1));
  return share * divisor;
}
