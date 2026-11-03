import { computeMonthTotals, emptyPlanilla } from '../monthPlanilla';
import { legacySharedToSplits, lineEffectiveClp } from '../sharedLineSplits';

describe('sharedLineSplits', () => {
  it('legacy ids + personas globales → divisor por ítem', () => {
    expect(legacySharedToSplits(['a', 'b'], 3)).toEqual({ a: 3, b: 3 });
  });

  it('tu parte por ítem con divisores distintos', () => {
    const line = { id: '1', category: 'Luz', amountClp: 90_000 };
    expect(lineEffectiveClp(line, { '1': 3 })).toBe(30_000);
    expect(lineEffectiveClp(line, {})).toBe(90_000);
  });
});

describe('casos César (dividir afecta Disponible)', () => {
  it('Arriendo 400.000 ÷2 pagado → disponible 1.250.000 con ingresos 1.450.000', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_450_000;
    p.fixedLines[0].category = 'Arriendo';
    p.fixedLines[0].amountClp = 400_000;
    p.fixedLines[0].paid = true;
    p.sharedLineSplits = { [p.fixedLines[0].id]: 2 };
    const t = computeMonthTotals(p);
    expect(t.paidSoFarClp).toBe(200_000);
    expect(t.availableClp).toBe(1_250_000);
  });

  it('Comida 100.000 ÷2 pendiente cuenta 50.000 en totales', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_000_000;
    p.additionalLines = [{ id: 'c', category: 'Comida', amountClp: 100_000, paid: false }];
    p.sharedLineSplits = { c: 2 };
    const t = computeMonthTotals(p);
    expect(t.pendingOutflowsClp).toBe(50_000);
    expect(t.totalAdditionalClp).toBe(50_000);
  });
});
