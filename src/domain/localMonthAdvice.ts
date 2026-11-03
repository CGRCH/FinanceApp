import { formatClp } from './money';
import type { MonthAdviceSummary } from './monthAdviceSummary';

export interface AdviceItem {
  id: string;
  title: string;
  body: string;
  priority: 'alta' | 'media' | 'baja';
}

const EMERGENCY_MONTHS_TARGET = 3;

export interface LocalAdviceContext {
  emergencyFundClp: number;
  totalDebtClp: number;
  monthlyEssentialsClp: number;
}

function sortAdvice(items: AdviceItem[]): AdviceItem[] {
  const order = { alta: 0, media: 1, baja: 2 };
  return [...items].sort((a, b) => order[a.priority] - order[b.priority]);
}

export function buildLocalMonthAdvice(summary: MonthAdviceSummary, ctx: LocalAdviceContext): AdviceItem[] {
  const items: AdviceItem[] = [];

  const pendingGap = summary.pendingOutflowsClp - summary.availableClp;
  if (pendingGap > 0) {
    items.push({
      id: 'pending-gap',
      title: 'Tus pendientes superan el Disponible',
      body: `Disponible ${formatClp(summary.availableClp)} vs pendiente ${formatClp(summary.pendingOutflowsClp)}. Te faltan ${formatClp(pendingGap)} para cubrir lo ya comprometido sin usar ingresos futuros.`,
      priority: 'alta',
    });
  }

  if (summary.projectedShortfallClp > 0) {
    items.push({
      id: 'shortfall',
      title: 'Riesgo de quedar sin plata antes de fin de mes',
      body: `Con el ritmo actual y ${summary.daysLeftInMonth} días restantes, podrías terminar ${formatClp(summary.projectedShortfallClp)} por debajo. Reduce adicionales o negocia fechas de pago.`,
      priority: 'alta',
    });
  }

  const unpaid = [...summary.fixedItems, ...summary.additionalItems]
    .filter((i) => !i.paid && i.yourShareClp > 0)
    .sort((a, b) => b.yourShareClp - a.yourShareClp);

  if (unpaid.length > 0) {
    const orderText = unpaid
      .slice(0, 6)
      .map((u, idx) => `${idx + 1}. ${u.label} (${formatClp(u.yourShareClp)})`)
      .join(' · ');
    items.push({
      id: 'pay-order',
      title: 'Orden sugerido de pago',
      body: orderText,
      priority: 'alta',
    });
  }

  const additionalUnpaid = summary.additionalItems.filter((a) => !a.paid && a.yourShareClp > 0);
  if (additionalUnpaid.length > 0 && (pendingGap > 0 || summary.projectedShortfallClp > 0)) {
    const candidate = [...additionalUnpaid].sort((a, b) => b.yourShareClp - a.yourShareClp)[0];
    items.push({
      id: 'postpone',
      title: 'Gasto adicional que podrías postergar',
      body: `Revisa posponer "${candidate.label}" (${formatClp(candidate.yourShareClp)}) si necesitas hacer espacio este mes.`,
      priority: 'media',
    });
  }

  const activeDebts = summary.debts.filter((d) => d.balanceClp > 0);
  if (activeDebts.length > 0) {
    const strat = summary.debtStrategyRecommendation ?? 'avalanche';
    const target =
      strat === 'snowball'
        ? activeDebts.reduce((a, b) => (b.balanceClp < a.balanceClp ? b : a))
        : activeDebts.reduce((a, b) => {
            if (b.interestRatePercent !== a.interestRatePercent) {
              return b.interestRatePercent > a.interestRatePercent ? b : a;
            }
            return b.balanceClp > a.balanceClp ? b : a;
          });
    const stratLabel = strat === 'snowball' ? 'bola de nieve' : 'avalancha';
    let body = `Enfócate en "${target.label}" (saldo ${formatClp(target.balanceClp)}`;
    if (target.interestRatePercent > 0) body += `, ${target.interestRatePercent}% anual`;
    if (target.type === 'personal' && target.installmentsTotal != null) {
      body += `, cuotas ${target.installmentsPaid ?? 0}/${target.installmentsTotal}`;
    }
    body += `). Estrategia ${stratLabel}.`;
    items.push({
      id: 'debt-target',
      title: 'Próxima deuda a atacar',
      body,
      priority: 'alta',
    });
  } else if (ctx.totalDebtClp <= 0) {
    const target = ctx.monthlyEssentialsClp * EMERGENCY_MONTHS_TARGET;
    if (ctx.emergencyFundClp < target) {
      items.push({
        id: 'emergency-fund',
        title: 'Arma tu fondo de emergencia',
        body: `Apunta a ${EMERGENCY_MONTHS_TARGET} meses de gastos esenciales (~${formatClp(target)}). Llevas ${formatClp(ctx.emergencyFundClp)} apartados.`,
        priority: 'media',
      });
    }
  }

  if (summary.dailyAllowanceClp > 0 && summary.projectedShortfallClp === 0 && pendingGap <= 0) {
    items.push({
      id: 'daily-budget',
      title: 'Referencia diaria de gasto',
      body: `Con lo comprometido, un tope orientativo es ${formatClp(summary.dailyAllowanceClp)} al día durante ${summary.daysLeftInMonth} días.`,
      priority: 'media',
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'ok',
      title: 'Vas bien encaminado',
      body: 'Mantén la planilla al día para que los consejos sigan siendo precisos.',
      priority: 'baja',
    });
  }

  return sortAdvice(items);
}

/** @deprecated Usar buildLocalMonthAdvice con MonthAdviceSummary. */
export interface AdviceContext {
  totalDebtClp: number;
  hasOverdueRisk: boolean;
  emergencyFundClp: number;
  monthlyEssentialsClp: number;
  projectedShortfallClp: number;
  dailyAllowanceClp: number;
}

export function buildAdvice(ctx: AdviceContext): AdviceItem[] {
  const summary: MonthAdviceSummary = {
    monthKey: '',
    daysLeftInMonth: 0,
    incomeClp: 0,
    availableClp: 0,
    pendingOutflowsClp: ctx.projectedShortfallClp > 0 ? 1 : 0,
    paidSoFarClp: 0,
    reserveClp: 0,
    fixedItems: [],
    additionalItems: [],
    debts: ctx.totalDebtClp > 0 ? [{ label: 'Deudas', balanceClp: ctx.totalDebtClp, interestRatePercent: 0, type: 'credit_card' }] : [],
    debtStrategyRecommendation: null,
    projectedShortfallClp: ctx.projectedShortfallClp,
    dailyAllowanceClp: ctx.dailyAllowanceClp,
  };
  if (ctx.projectedShortfallClp > 0) {
    summary.pendingOutflowsClp = summary.availableClp + 1;
    summary.availableClp = 0;
  }
  return buildLocalMonthAdvice(summary, {
    emergencyFundClp: ctx.emergencyFundClp,
    totalDebtClp: ctx.totalDebtClp,
    monthlyEssentialsClp: ctx.monthlyEssentialsClp,
  });
}
