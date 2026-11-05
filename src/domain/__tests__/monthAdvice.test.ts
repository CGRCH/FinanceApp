import { buildLocalMonthAdvice } from '../localMonthAdvice';
import { buildMonthAdviceSummary, formatMonthAdviceSummaryPreview } from '../monthAdviceSummary';
import { emptyPlanilla } from '../monthPlanilla';
import { computeProjection } from '../projection';
import type { DebtRow } from '../../db/schema';

describe('monthAdviceSummary', () => {
  it('arma ítems con tu parte y deudas', () => {
    const planilla = emptyPlanilla('2026-11');
    planilla.incomeClp = 1_500_000;
    planilla.fixedLines[0].amountClp = 400_000;
    planilla.fixedLines[0].paid = false;
    planilla.additionalLines = [{ id: 'a1', category: 'Comida', amountClp: 80_000, paid: false }];

    const projection = computeProjection({
      balanceNowClp: 1_500_000,
      pendingFixedClp: 480_000,
      pendingAdditionalClp: 0,
      avgDailyVariableClp: 0,
      dayOfMonth: 10,
      daysInMonth: 30,
    });

    const debt: DebtRow = {
      id: 'd1',
      name: 'Tarjeta',
      balance_clp: 200_000,
      minimum_payment_clp: 30_000,
      interest_rate_bps: 2400,
      sort_order: 0,
      paid_off_at: null,
      debt_type: 'credit_card',
      total_clp: null,
      installments_total: null,
      installment_amount_clp: null,
    };

    const summary = buildMonthAdviceSummary({
      planilla,
      totals: {
        totalFixedClp: 400_000,
        totalAdditionalClp: 80_000,
        fondosMenosGastosClp: 1_020_000,
        sharedSelectedTotalClp: 0,
        sharedYourPartClp: 0,
        householdTotalClp: 0,
        householdYourShareClp: 0,
        reserveClp: 0,
        allOutflowsClp: 480_000,
        surplusAfterReserveClp: 1_020_000,
        fundTotalClp: 1_500_000,
        paidSoFarClp: 0,
        availableClp: 1_500_000,
        pendingOutflowsClp: 480_000,
        debtPaymentsClp: 0,
        afterPayingAllClp: 1_020_000,
      },
      debts: [debt],
      debtComparison: null,
      projection,
      monthKey: '2026-11',
    });

    expect(summary.fixedItems.some((f) => f.label && f.yourShareClp === 400_000)).toBe(true);
    expect(summary.debts[0].interestRatePercent).toBe(24);
    const preview = formatMonthAdviceSummaryPreview(summary);
    expect(preview).toContain('Tarjeta');
    expect(preview).not.toContain('2026-10');
  });
});

describe('buildLocalMonthAdvice', () => {
  it('prioriza brecha pendiente vs disponible y orden de pago', () => {
    const tips = buildLocalMonthAdvice(
      {
        monthKey: '2026-11',
        daysLeftInMonth: 15,
        incomeClp: 1_000_000,
        availableClp: 100_000,
        pendingOutflowsClp: 350_000,
        paidSoFarClp: 0,
        reserveClp: 0,
        fixedItems: [{ label: 'Arriendo', amountClp: 300_000, yourShareClp: 300_000, paid: false }],
        additionalItems: [{ label: 'Comida', amountClp: 50_000, yourShareClp: 50_000, paid: false }],
        debts: [],
        debtStrategyRecommendation: null,
        projectedShortfallClp: 0,
        dailyAllowanceClp: 0,
      },
      { emergencyFundClp: 0, totalDebtClp: 0, monthlyEssentialsClp: 300_000 },
    );
    expect(tips.some((t) => t.id === 'pending-gap')).toBe(true);
    expect(tips.some((t) => t.id === 'pay-order')).toBe(true);
  });
});
