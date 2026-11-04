import { computeMonthTotals, emptyPlanilla } from '../monthPlanilla';
import {
  allPayableLinesMarkedPaid,
  applyAutoReserveToPlanilla,
  isLinePaidFlag,
  suggestedReserveClpWhenAllPaid,
} from '../planillaReserve';

describe('planillaReserve', () => {
  it('isLinePaidFlag trata strings SQLite', () => {
    expect(isLinePaidFlag('1')).toBe(true);
    expect(isLinePaidFlag('0')).toBe(false);
    expect(isLinePaidFlag(0)).toBe(false);
  });

  it('calcula reserva = ingresos − gastos (tu parte) cuando todo está Pagado', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_000_000;
    p.fixedLines[0].amountClp = 400_000;
    p.fixedLines[0].paid = true;
    p.additionalLines = [{ id: 'add-1', category: 'Cena', amountClp: 200_000, paid: true }];
    p.sharedLineSplits = { 'add-1': 2 };

    expect(allPayableLinesMarkedPaid(p)).toBe(true);
    expect(suggestedReserveClpWhenAllPaid(p)).toBe(500_000);

    const withReserve = applyAutoReserveToPlanilla(p);
    expect(withReserve.reserveClp).toBe(500_000);

    const totals = computeMonthTotals(withReserve);
    expect(totals.availableClp).toBe(500_000);
    expect(totals.afterPayingAllClp).toBe(0);
  });

  it('no asigna reserva si falta un Pagado', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_000_000;
    p.fixedLines[0].amountClp = 400_000;
    p.fixedLines[0].paid = true;
    p.additionalLines = [{ id: 'a', category: 'X', amountClp: 100_000, paid: false }];

    expect(suggestedReserveClpWhenAllPaid(p)).toBeNull();
    expect(applyAutoReserveToPlanilla(p).reserveClp).toBe(0);
  });

  it('incluye pagos de deuda en la condición Pagado', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 800_000;
    p.fixedLines[0].amountClp = 300_000;
    p.fixedLines[0].paid = true;
    p.debtPaymentLines = [
      {
        id: 'dp-1',
        debtId: 'd1',
        paymentKind: 'partial',
        amountClp: 100_000,
        paid: false,
      },
    ];
    expect(allPayableLinesMarkedPaid(p, { d1: 100_000 })).toBe(false);

    p.debtPaymentLines[0].paid = true;
    expect(suggestedReserveClpWhenAllPaid(p, { d1: 100_000 })).toBe(400_000);
  });
});
