import { removeDebtFromPlanilla, planillaReferencesDebt } from '../debtCleanup';
import { emptyPlanilla } from '../monthPlanilla';

describe('removeDebtFromPlanilla', () => {
  it('elimina líneas de pago del mes abierto sin tocar otras deudas', () => {
    const p = emptyPlanilla('2026-11');
    p.debtPaymentLines = [
      { id: 'x', debtId: 'd1', paymentKind: 'partial', amountClp: 50_000, paid: true },
      { id: 'y', debtId: 'd2', paymentKind: 'partial', amountClp: 30_000, paid: false },
    ];
    p.additionalLines = [{ id: 'a', category: 'Pago', amountClp: 1, debtId: 'd1' }];

    expect(planillaReferencesDebt(p, 'd1')).toBe(true);
    const next = removeDebtFromPlanilla(p, 'd1');
    expect(next.debtPaymentLines).toHaveLength(1);
    expect(next.debtPaymentLines[0].debtId).toBe('d2');
    expect(next.additionalLines[0].debtId).toBeNull();
  });
});
