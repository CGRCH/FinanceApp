import type { DebtRow } from '../../db/schema';
import { debtDefaultPartialPaymentClp, personalDebtProgress, suggestInstallmentAmountClp } from '../personalDebt';

const personalBase: DebtRow = {
  id: 'p1',
  name: 'Juan',
  balance_clp: 800_000,
  minimum_payment_clp: 100_000,
  interest_rate_bps: 0,
  sort_order: 0,
  paid_off_at: null,
  debt_type: 'personal',
  total_clp: 1_000_000,
  installments_total: 10,
  installment_amount_clp: 100_000,
};

describe('personalDebt', () => {
  it('sugiere cuota redondeada total ÷ cuotas', () => {
    expect(suggestInstallmentAmountClp(1_000_001, 10)).toBe(100_000);
    expect(suggestInstallmentAmountClp(1_000_000, 10)).toBe(100_000);
  });

  it('cuotas pagadas = floor(pagado / valor cuota)', () => {
    const progress = personalDebtProgress(personalBase);
    expect(progress?.installmentsPaid).toBe(2);
    expect(progress?.installmentsTotal).toBe(10);
  });

  it('saldo cero marca todas las cuotas pagadas', () => {
    const progress = personalDebtProgress({ ...personalBase, balance_clp: 0, paid_off_at: '2026-11-01' });
    expect(progress?.installmentsPaid).toBe(10);
    expect(progress?.fraction).toBe(1);
  });

  it('abono parcial usa valor cuota como default en planilla', () => {
    expect(debtDefaultPartialPaymentClp(personalBase)).toBe(100_000);
    expect(
      debtDefaultPartialPaymentClp({
        ...personalBase,
        debt_type: 'credit_card',
        minimum_payment_clp: 45_000,
      }),
    ).toBe(45_000);
  });
});
