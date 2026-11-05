import { listDebts } from '../repository';

describe('listDebts', () => {
  it('normaliza montos string desde SQLite (Hermes / Android)', async () => {
    const row = {
      id: 'd1',
      name: 'Tarjeta',
      balance_clp: '680000',
      minimum_payment_clp: '45000',
      interest_rate_bps: '2800',
      sort_order: 0,
      paid_off_at: null,
      debt_type: 'credit_card',
      total_clp: null,
      installments_total: null,
      installment_amount_clp: null,
    };
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([row]),
    };
    const debts = await listDebts(db as never);
    expect(debts[0].balance_clp).toBe(680_000);
    expect(debts[0].minimum_payment_clp).toBe(45_000);
    expect(debts[0].interest_rate_bps).toBe(2800);
  });
});
