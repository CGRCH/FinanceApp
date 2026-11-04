import { computeMonthTotals, emptyPlanilla } from '../monthPlanilla';
import { lineSplitDivisor } from '../sharedLineSplits';
import { newPlanillaLineId } from '../planillaLineId';
import {
  buildMonthTransactionWrites,
  planillaSplitsAfterTransactionSync,
  shouldPersistExpenseLine,
} from '../planillaPersistence';

describe('planillaPersistence splits', () => {
  it('persiste línea adicional con split aunque el monto sea 0', () => {
    const id = newPlanillaLineId('additional');
    const line = { id, category: 'Cena', amountClp: 0, paid: false };
    const splits = { [id]: 2 };
    expect(shouldPersistExpenseLine(line, splits)).toBe(true);
  });

  it('nueva línea adicional → split → save → reload mantiene split y totales', () => {
    const lineId = newPlanillaLineId('additional');
    let planilla = emptyPlanilla('2026-11');
    planilla.incomeClp = 1_000_000;
    planilla.additionalLines = [{ id: lineId, category: 'Salida', amountClp: 200_000, paid: true }];
    planilla.sharedLineSplits = { [lineId]: 2 };

    const writes = buildMonthTransactionWrites(planilla, {
      debtNames: new Map(),
      debtBalances: {},
      applyDebtPayments: false,
    });
    expect(writes.some((w) => w.id === lineId && w.splitPeople === 2)).toBe(true);

    const storedSplits = { [lineId]: 2 };
    const reloaded = planillaSplitsAfterTransactionSync(planilla, writes, storedSplits);
    expect(reloaded.additionalLines[0]?.id).toBe(lineId);
    expect(lineSplitDivisor(reloaded.sharedLineSplits, lineId)).toBe(2);

    const totals = computeMonthTotals({ ...planilla, ...reloaded });
    expect(totals.paidSoFarClp).toBe(100_000);
  });
});

import { shouldApplyReloadAfterSave } from '../planillaAutosave';
