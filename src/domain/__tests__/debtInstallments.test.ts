import type { DebtRow } from '../../db/schema';
import {
  applyPaidDebtPaymentsToBalance,
  computeInstallmentStates,
  decodeDebtPaymentNote,
  encodeDebtPaymentNote,
  installmentAmountAtIndex,
  replaceWithFullPaymentLine,
  setInstallmentIncludedInPlanilla,
  toggleInstallmentPaidInRecords,
  type InstallmentPaymentRecord,
} from '../debtInstallments';
import { emptyPlanilla } from '../monthPlanilla';

const personalDebt: Pick<DebtRow, 'installments_total' | 'installment_amount_clp' | 'total_clp' | 'id'> = {
  id: 'd1',
  installments_total: 10,
  installment_amount_clp: 100_000,
  total_clp: 1_000_000,
};

describe('debtInstallments', () => {
  it('codifica y decodifica cuota en note', () => {
    expect(encodeDebtPaymentNote({ paymentKind: 'partial', installmentIndex: 3 })).toBe('inst:3');
    expect(decodeDebtPaymentNote('inst:3').installmentIndex).toBe(3);
    expect(encodeDebtPaymentNote({ paymentKind: 'full' })).toBe('full');
  });

  it('última cuota absorbe redondeo', () => {
    expect(installmentAmountAtIndex({ ...personalDebt, total_clp: 1_000_001 }, 10)).toBe(100_001);
    expect(installmentAmountAtIndex({ ...personalDebt, total_clp: 1_000_001 }, 9)).toBe(100_000);
  });

  it('marca cuotas pagadas por mes y pago total', () => {
    const records: InstallmentPaymentRecord[] = [
      { monthKey: '2026-10', paymentKind: 'partial', installmentIndex: 1, amountClp: 100_000, paid: true },
      { monthKey: '2026-11', paymentKind: 'partial', installmentIndex: 2, amountClp: 100_000, paid: true },
    ];
    const states = computeInstallmentStates(personalDebt, records);
    expect(states[0].status).toBe('pagada');
    expect(states[0].paidMonthKey).toBe('2026-10');
    expect(states[1].status).toBe('pagada');
    expect(states[2].status).toBe('pendiente');

    const full: InstallmentPaymentRecord[] = [
      { monthKey: '2026-12', paymentKind: 'full', amountClp: 800_000, paid: true },
    ];
    const afterFull = computeInstallmentStates(personalDebt, [...records, ...full]);
    expect(afterFull.every((s) => s.status === 'pagada')).toBe(true);
  });

  it('toggle pagado idempotente en saldo simulado', () => {
    let records: InstallmentPaymentRecord[] = [];
    records = toggleInstallmentPaidInRecords(records, '2026-11', 2, true, 100_000);
    expect(applyPaidDebtPaymentsToBalance(900_000, records)).toBe(800_000);
    records = toggleInstallmentPaidInRecords(records, '2026-11', 2, false, 100_000);
    expect(applyPaidDebtPaymentsToBalance(900_000, records)).toBe(900_000);
    records = toggleInstallmentPaidInRecords(records, '2026-11', 2, true, 100_000);
    records = toggleInstallmentPaidInRecords(records, '2026-11', 2, true, 100_000);
    expect(applyPaidDebtPaymentsToBalance(900_000, records)).toBe(800_000);
  });

  it('pago total deja saldo en cero', () => {
    const records: InstallmentPaymentRecord[] = [
      { monthKey: '2026-11', paymentKind: 'full', amountClp: 900_000, paid: true },
    ];
    expect(applyPaidDebtPaymentsToBalance(900_000, records)).toBe(0);
  });

  it('agrega línea al incluir cuota en planilla', () => {
    const p = emptyPlanilla('2026-11');
    const debt = { ...personalDebt, debt_type: 'personal' as const, name: 'Juan', balance_clp: 900_000, minimum_payment_clp: 100_000, interest_rate_bps: 0, sort_order: 0, paid_off_at: null };
    const next = setInstallmentIncludedInPlanilla(p.debtPaymentLines, debt as DebtRow, 3, true);
    expect(next).toHaveLength(1);
    expect(next[0].installmentIndex).toBe(3);
    expect(next[0].amountClp).toBe(100_000);
  });

  it('pago total reemplaza líneas del mes para esa deuda', () => {
    const lines = [
      { id: 'a', debtId: 'd1', paymentKind: 'partial' as const, installmentIndex: 2, amountClp: 100_000 },
    ];
    const next = replaceWithFullPaymentLine(lines, 'd1', 800_000);
    expect(next).toHaveLength(1);
    expect(next[0].paymentKind).toBe('full');
  });

  it('cuotas en meses distintos reducen saldo acumulado', () => {
    const records: InstallmentPaymentRecord[] = [
      { monthKey: '2026-10', paymentKind: 'partial', installmentIndex: 1, amountClp: 100_000, paid: true },
      { monthKey: '2026-11', paymentKind: 'partial', installmentIndex: 2, amountClp: 100_000, paid: true },
    ];
    expect(applyPaidDebtPaymentsToBalance(1_000_000, records)).toBe(800_000);
  });
});
