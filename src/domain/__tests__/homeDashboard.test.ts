import { emptyPlanilla } from '../monthPlanilla';
import { buildHomeDashboard, buildHomeDistribution, buildUpcomingPayments } from '../homeDashboard';
import type { DebtRow } from '../../db/schema';

describe('homeDashboard', () => {
  it('separa diezmo de otros fijos en la distribución', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 1_000_000;
    p.fixedLines = [
      { id: '1', category: 'Arriendo', amountClp: 400_000 },
      { id: '2', category: 'Diezmo', amountClp: 100_000 },
    ];
    const totals = {
      totalFixedClp: 500_000,
      totalAdditionalClp: 50_000,
      fondosMenosGastosClp: 500_000,
      sharedSelectedTotalClp: 0,
      sharedYourPartClp: 0,
      householdTotalClp: 0,
      householdYourShareClp: 0,
      reserveClp: 0,
      allOutflowsClp: 550_000,
      surplusAfterReserveClp: 450_000,
      fundTotalClp: 1_000_000,
      paidSoFarClp: 0,
      availableClp: 1_000_000,
      pendingOutflowsClp: 550_000,
      debtPaymentsClp: 0,
      afterPayingAllClp: 450_000,
    };
    const dist = buildHomeDistribution(p, totals);
    expect(dist.find((s) => s.id === 'diezmo')?.amountClp).toBe(100_000);
    expect(dist.find((s) => s.id === 'fixed')?.amountClp).toBe(400_000);
  });

  it('lista pagos próximos sin ítems pagados', () => {
    const p = emptyPlanilla('2026-11');
    p.fixedLines[0].amountClp = 200_000;
    p.fixedLines[0].paid = false;
    p.debtPaymentLines = [
      { id: 'dp', debtId: 'd1', paymentKind: 'partial', amountClp: 80_000, paid: false },
    ];
    const upcoming = buildUpcomingPayments(p, { d1: 500_000 }, { d1: 'Tarjeta' });
    expect(upcoming).toHaveLength(2);
    expect(upcoming.some((u) => u.kind === 'debt')).toBe(true);
  });

  it('buildHomeDashboard marca datos cuando hay ingresos', () => {
    const p = emptyPlanilla('2026-11');
    p.incomeClp = 100_000;
    const dash = buildHomeDashboard({
      planilla: p,
      totals: {
        totalFixedClp: 0,
        totalAdditionalClp: 0,
        fondosMenosGastosClp: 100_000,
        sharedSelectedTotalClp: 0,
        sharedYourPartClp: 0,
        householdTotalClp: 0,
        householdYourShareClp: 0,
        reserveClp: 0,
        allOutflowsClp: 0,
        surplusAfterReserveClp: 100_000,
        fundTotalClp: 100_000,
        paidSoFarClp: 0,
        availableClp: 100_000,
        pendingOutflowsClp: 0,
        debtPaymentsClp: 0,
        afterPayingAllClp: 100_000,
      },
      debtBalances: {},
      debtRows: [] as DebtRow[],
      projection: {
        projectedEndBalanceClp: 100_000,
        dailyAllowanceClp: 3_333,
        willRunShort: false,
        daysRemaining: 30,
        projectedShortfallClp: 0,
      },
    });
    expect(dash.hasDistributionData).toBe(true);
  });
});
