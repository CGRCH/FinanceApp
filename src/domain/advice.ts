export interface AdviceContext {
  totalDebtClp: number;
  hasOverdueRisk: boolean;
  emergencyFundClp: number;
  monthlyEssentialsClp: number;
  projectedShortfallClp: number;
  dailyAllowanceClp: number;
}

export interface AdviceItem {
  id: string;
  title: string;
  body: string;
  priority: 'alta' | 'media' | 'baja';
}

const EMERGENCY_MONTHS_TARGET = 3;

export function buildAdvice(ctx: AdviceContext): AdviceItem[] {
  const items: AdviceItem[] = [];

  if (ctx.projectedShortfallClp > 0) {
    items.push({
      id: 'shortfall',
      title: 'Ojo: este mes podrías quedar en rojo',
      body: `Proyectamos un faltante de aprox. $${ctx.projectedShortfallClp.toLocaleString('es-CL')}. Revisa gastos adicionales o negocia fechas antes de comprometerte a más cosas.`,
      priority: 'alta',
    });
  }

  if (ctx.totalDebtClp > 0) {
    items.push({
      id: 'debt-first',
      title: 'Primero las deudas',
      body: 'Mientras tengas deudas con interés, conviene destinar excedentes a pagarlas antes de invertir o aumentar el estilo de vida.',
      priority: 'alta',
    });
  } else {
    const target = ctx.monthlyEssentialsClp * EMERGENCY_MONTHS_TARGET;
    if (ctx.emergencyFundClp < target) {
      items.push({
        id: 'emergency-fund',
        title: 'Arma tu fondo de emergencia',
        body: `Apunta a guardar al menos ${EMERGENCY_MONTHS_TARGET} meses de gastos esenciales (~$${target.toLocaleString('es-CL')}). Así un imprevisto no te tira el mes.`,
        priority: 'media',
      });
    }
  }

  if (ctx.dailyAllowanceClp > 0 && ctx.projectedShortfallClp === 0) {
    items.push({
      id: 'daily-budget',
      title: 'Cuánto podís gastar hoy',
      body: `Con lo que queda del mes, un referente diario es $${ctx.dailyAllowanceClp.toLocaleString('es-CL')} (sin contar lo ya comprometido).`,
      priority: 'media',
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'ok',
      title: 'Vas bien encaminado',
      body: 'Registra tus movimientos para mantener la proyección al día. Pequeños hábitos, cifras claras.',
      priority: 'baja',
    });
  }

  return items.sort((a, b) => {
    const order = { alta: 0, media: 1, baja: 2 };
    return order[a.priority] - order[b.priority];
  });
}
