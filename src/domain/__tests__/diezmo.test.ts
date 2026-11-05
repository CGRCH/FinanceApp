import {
  applyDiezmoForMonth,
  applyDiezmoToPlanilla,
  diezmoAmountFromIncomeClp,
  diezmoHintLabel,
  isDiezmoCategory,
} from '../diezmo';
import { emptyPlanilla } from '../monthPlanilla';

describe('diezmo', () => {
  it('detecta Diezmo sin importar mayúsculas', () => {
    expect(isDiezmoCategory('Diezmo')).toBe(true);
    expect(isDiezmoCategory(' DIEZMO ')).toBe(true);
    expect(isDiezmoCategory('Comida')).toBe(false);
  });

  it('calcula 10% redondeado a entero CLP', () => {
    expect(diezmoAmountFromIncomeClp(1_450_000)).toBe(145_000);
    expect(diezmoAmountFromIncomeClp(1_000_001)).toBe(100_000);
    expect(diezmoAmountFromIncomeClp(0)).toBe(0);
  });

  it('hint muestra ingresos base', () => {
    expect(diezmoHintLabel(1_450_000)).toContain('1.450.000');
    expect(diezmoHintLabel(1_450_000)).toMatch(/10%/);
  });

  it('actualiza línea fija Diezmo al cambiar ingresos', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_450_000;
    p.fixedLines.push({ id: 'dz', category: 'Diezmo', amountClp: 0 });
    const next = applyDiezmoToPlanilla(p);
    expect(next.fixedLines.find((l) => l.id === 'dz')?.amountClp).toBe(145_000);
  });

  it('no recalcula en mes cerrado', () => {
    const p = emptyPlanilla('2026-10');
    p.incomeClp = 2_000_000;
    p.fixedLines = [{ id: 'dz', category: 'Diezmo', amountClp: 100_000 }];
    const now = new Date('2026-11-15');
    const out = applyDiezmoForMonth(p, '2026-10', now);
    expect(out.fixedLines[0].amountClp).toBe(100_000);
  });

  it('recalcula en mes actual editable', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_450_000;
    p.fixedLines = [{ id: 'dz', category: 'Diezmo', amountClp: 50_000 }];
    const now = new Date('2026-11-15');
    const out = applyDiezmoForMonth(p, '2026-11', now);
    expect(out.fixedLines[0].amountClp).toBe(145_000);
  });
});
