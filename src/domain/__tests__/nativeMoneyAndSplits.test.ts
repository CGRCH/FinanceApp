import {
  mergeSplitMaps,
  normalizeSharedLineSplits,
  parseSplitDivisor,
  splitsFromTransactionRows,
} from '../sharedLineSplits';
import { computeMonthTotals, emptyPlanilla } from '../monthPlanilla';
import { coerceClpAmount, coerceSqliteBoolean, coerceSqliteInteger } from '../sqliteCoerce';
import { formatClp, parseClpInput } from '../money';
import { yourShareClp } from '../sharedExpenses';

describe('sqliteCoerce', () => {
  it('convierte strings de SQLite a enteros', () => {
    expect(coerceSqliteInteger('400000')).toBe(400_000);
    expect(coerceSqliteInteger('400.000')).toBe(400_000);
    expect(coerceSqliteBoolean('1')).toBe(true);
    expect(coerceSqliteBoolean(0)).toBe(false);
  });

  it('acepta divisor split como string', () => {
    expect(parseSplitDivisor('2')).toBe(2);
    expect(parseSplitDivisor(3)).toBe(3);
    expect(parseSplitDivisor('1')).toBeNull();
  });
});

describe('money parsing Hermes-safe', () => {
  it('parseClpInput ignora puntos y comas', () => {
    expect(parseClpInput('$400.000')).toBe(400_000);
    expect(parseClpInput('200,000')).toBe(200_000);
  });

  it('formatClp no produce NaN con entrada string coercible', () => {
    expect(formatClp(coerceClpAmount('250000'))).toContain('250');
    expect(formatClp(200_000)).not.toContain('NaN');
  });

  it('yourShareClp con montos string', () => {
    expect(yourShareClp('400000' as unknown as number, '2' as unknown as number)).toBe(200_000);
  });
});

describe('splits desde transacciones (ids estables)', () => {
  it('reconstruye mapa por id de línea', () => {
    const fromRows = splitsFromTransactionRows([
      { id: 'tx-arriendo', kind: 'fixed', split_people: '2' },
      { id: 'tx-luz', kind: 'fixed', split_people: null },
    ]);
    expect(fromRows).toEqual({ 'tx-arriendo': 2 });
    const merged = mergeSplitMaps({ 'old-template-id': 3 }, fromRows);
    expect(merged['tx-arriendo']).toBe(2);
    expect(merged['old-template-id']).toBe(3);
  });

  it('totales usan split tras merge por id de transacción', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_450_000;
    p.fixedLines[0].id = 'tx-arriendo';
    p.fixedLines[0].category = 'Arriendo';
    p.fixedLines[0].amountClp = 400_000;
    p.fixedLines[0].paid = true;
    p.sharedLineSplits = mergeSplitMaps({}, { 'tx-arriendo': 2 });
    const t = computeMonthTotals(p);
    expect(t.paidSoFarClp).toBe(200_000);
    expect(t.availableClp).toBe(1_250_000);
  });

  it('normalizeSharedLineSplits descarta valores inválidos', () => {
    expect(normalizeSharedLineSplits({ a: '2', b: 'x', c: 4 })).toEqual({ a: 2, c: 4 });
  });
});
