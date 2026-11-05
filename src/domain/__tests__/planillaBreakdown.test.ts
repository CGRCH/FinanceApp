import { compareImportedMonthToExcelFormulas } from '../excelFormulaCheck';
import { computePlanillaBreakdown } from '../planillaBreakdown';
import { computeMonthTotals, emptyPlanilla } from '../monthPlanilla';
import { createFictionalFixtureWorkbook, parseGestiónWorkbook } from '../xlsxGestión';

describe('planilla breakdown identities', () => {
  it('pagado + pendiente = total comprometido', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_450_000;
    p.fixedLines[0].amountClp = 420_000;
    p.debtPaymentLines = [
      { id: 'd1', debtId: 'x', paymentKind: 'partial', amountClp: 1_200_000, paid: false },
    ];
    const b = computePlanillaBreakdown(p, { x: 1_500_000 }, { x: 'Crédito consumo' });
    expect(b.totals.paidSoFarClp + b.totals.pendingOutflowsClp).toBe(b.totals.allOutflowsClp);
    expect(b.totals.availableClp + b.totals.paidSoFarClp).toBe(p.incomeClp);
  });
});

describe('caso captura César (nov 2026 ficticio)', () => {
  /**
   * Luz/Agua/Internet ÷3 cada uno; pendiente usa tu parte.
   */
  const buildCapturePlanilla = () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_450_000;
    p.fixedLines = [
      { id: '1', category: 'Arriendo', amountClp: 420_000 },
      { id: '2', category: 'Tlf', amountClp: 18_000 },
      { id: '3', category: 'Luz', amountClp: 35_000 },
      { id: '4', category: 'Agua', amountClp: 12_000 },
      { id: '5', category: 'Internet', amountClp: 25_000 },
    ];
    p.additionalLines = [{ id: 'a1', category: 'Otros', amountClp: 185_000 }];
    p.sharedLineSplits = { '3': 3, '4': 3, '5': 3 };
    p.reserveClp = 0;
    p.debtPaymentLines = [
      {
        id: 'dp1',
        debtId: 'credito',
        paymentKind: 'partial',
        amountClp: 1_200_000,
        paid: false,
      },
    ];
    return p;
  };

  it('explica fondos, pendiente y quedaría de la captura', () => {
    const p = buildCapturePlanilla();
    const t = computeMonthTotals(p, { credito: 2_000_000 });
    expect(t.availableClp).toBe(1_450_000);
    expect(t.pendingOutflowsClp).toBe(1_847_000);
    expect(t.afterPayingAllClp).toBe(-397_000);
    expect(t.paidSoFarClp).toBe(0);

    const b = computePlanillaBreakdown(p, { credito: 2_000_000 }, { credito: 'Crédito consumo' });
    expect(b.fixedPendingClp + b.additionalPendingClp + b.debtPendingClp).toBe(1_847_000);
    expect(b.debtPendingClp).toBe(1_200_000);
  });
});

describe('validación fórmulas Excel (fixture ficticio)', () => {
  it('fondos menos gastos y reserva coinciden con fórmula clásica del import', () => {
    const buffer = createFictionalFixtureWorkbook();
    const parsed = parseGestiónWorkbook(buffer);
    for (const month of parsed.months) {
      const check = compareImportedMonthToExcelFormulas(month);
      expect(check.reserveMatches).toBe(true);
      if (check.fondosFromSheet !== null) {
        expect(check.fondosMatches).toBe(true);
      }
    }
  });
});
