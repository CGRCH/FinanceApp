import type { DebtRow } from '@/src/db/schema';
import type { DebtPaymentLine } from './monthPlanilla';

export type InstallmentPaymentRecord = {
  monthKey: string;
  paymentKind: 'full' | 'partial';
  installmentIndex?: number;
  amountClp: number;
  paid: boolean;
};

export type InstallmentState = {
  index: number;
  amountClp: number;
  status: 'pagada' | 'pendiente';
  paidMonthKey?: string;
};

export function encodeDebtPaymentNote(
  line: Pick<DebtPaymentLine, 'paymentKind' | 'installmentIndex'>,
): string {
  if (line.installmentIndex != null && line.installmentIndex >= 1) {
    return `inst:${line.installmentIndex}`;
  }
  return line.paymentKind;
}

export function decodeDebtPaymentNote(note: string | null): {
  paymentKind: 'full' | 'partial';
  installmentIndex?: number;
} {
  if (note === 'full') return { paymentKind: 'full' };
  if (note?.startsWith('inst:')) {
    const n = Number.parseInt(note.slice(5), 10);
    if (Number.isFinite(n) && n >= 1) {
      return { paymentKind: 'partial', installmentIndex: n };
    }
  }
  return { paymentKind: 'partial' };
}

export function installmentAmountAtIndex(
  debt: Pick<DebtRow, 'installments_total' | 'installment_amount_clp' | 'total_clp'>,
  index: number,
): number {
  const n = Math.max(1, debt.installments_total ?? 1);
  const base = Math.max(0, debt.installment_amount_clp ?? 0);
  const total = Math.max(0, debt.total_clp ?? 0);
  const i = Math.max(1, Math.min(n, index));
  if (i < n) return base;
  return Math.max(0, total - base * (n - 1));
}

export function computeInstallmentStates(
  debt: Pick<DebtRow, 'installments_total' | 'installment_amount_clp' | 'total_clp'>,
  records: InstallmentPaymentRecord[],
): InstallmentState[] {
  const n = Math.max(1, debt.installments_total ?? 1);
  const states: InstallmentState[] = [];
  for (let i = 1; i <= n; i += 1) {
    states.push({
      index: i,
      amountClp: installmentAmountAtIndex(debt, i),
      status: 'pendiente',
    });
  }

  const paidOnly = records.filter((r) => r.paid);
  const sorted = [...paidOnly].sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  for (const rec of sorted) {
    if (rec.paymentKind === 'full') {
      for (const st of states) {
        if (st.status === 'pendiente') {
          st.status = 'pagada';
          st.paidMonthKey = rec.monthKey;
        }
      }
      continue;
    }
    if (rec.installmentIndex != null && rec.installmentIndex >= 1 && rec.installmentIndex <= n) {
      const st = states[rec.installmentIndex - 1];
      if (st.status === 'pendiente') {
        st.status = 'pagada';
        st.paidMonthKey = rec.monthKey;
      }
    }
  }

  return states;
}

export function debtPaymentLineForInstallment(
  debtId: string,
  debt: DebtRow,
  installmentIndex: number,
  existingId?: string,
): DebtPaymentLine {
  return {
    id: existingId ?? `dp-${debtId}-i${installmentIndex}-${Date.now()}`,
    debtId,
    paymentKind: 'partial',
    installmentIndex,
    amountClp: installmentAmountAtIndex(debt, installmentIndex),
    paid: false,
  };
}

export function debtPaymentLineForFullPayoff(debtId: string, balanceClp: number, existingId?: string): DebtPaymentLine {
  return {
    id: existingId ?? `dp-${debtId}-full-${Date.now()}`,
    debtId,
    paymentKind: 'full',
    amountClp: balanceClp,
    paid: false,
  };
}

/** Agrega o quita líneas de cuota en el mes (solo cuotas pendientes globales). */
export function setInstallmentIncludedInPlanilla(
  planillaLines: DebtPaymentLine[],
  debt: DebtRow,
  installmentIndex: number,
  include: boolean,
): DebtPaymentLine[] {
  const debtId = debt.id;
  const existingIdx = planillaLines.findIndex(
    (l) => l.debtId === debtId && l.installmentIndex === installmentIndex,
  );

  if (include) {
    if (existingIdx >= 0) return planillaLines;
    return [...planillaLines, debtPaymentLineForInstallment(debtId, debt, installmentIndex)];
  }

  if (existingIdx < 0) return planillaLines;
  const line = planillaLines[existingIdx];
  if (line.paid) return planillaLines;
  return planillaLines.filter((_, i) => i !== existingIdx);
}

export function replaceWithFullPaymentLine(
  planillaLines: DebtPaymentLine[],
  debtId: string,
  balanceClp: number,
): DebtPaymentLine[] {
  const without = planillaLines.filter((l) => l.debtId !== debtId);
  return [...without, debtPaymentLineForFullPayoff(debtId, balanceClp)];
}

export function applyPaidDebtPaymentsToBalance(
  initialBalanceClp: number,
  records: InstallmentPaymentRecord[],
): number {
  let balance = initialBalanceClp;
  const sorted = [...records].filter((r) => r.paid).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  for (const rec of sorted) {
    if (rec.paymentKind === 'full') {
      balance = 0;
      continue;
    }
    balance = Math.max(0, balance - Math.max(0, rec.amountClp));
  }
  return balance;
}

export function toggleInstallmentPaidInRecords(
  records: InstallmentPaymentRecord[],
  monthKey: string,
  installmentIndex: number,
  paid: boolean,
  amountClp: number,
): InstallmentPaymentRecord[] {
  const idx = records.findIndex(
    (r) => r.monthKey === monthKey && r.installmentIndex === installmentIndex && r.paymentKind === 'partial',
  );
  if (idx >= 0) {
    const next = [...records];
    next[idx] = { ...next[idx], paid, amountClp };
    return next;
  }
  return [
    ...records,
    { monthKey, paymentKind: 'partial', installmentIndex, amountClp, paid },
  ];
}
