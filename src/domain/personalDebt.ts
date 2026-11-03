import type { DebtRow, DebtType } from '@/src/db/schema';

export function suggestInstallmentAmountClp(totalClp: number, installments: number): number {
  if (!Number.isFinite(totalClp) || totalClp <= 0) return 0;
  const n = Math.max(1, Math.floor(installments));
  return Math.round(totalClp / n);
}

export interface PersonalDebtProgress {
  installmentsPaid: number;
  installmentsTotal: number;
  /** 0–1 */
  fraction: number;
}

/** Cuotas pagadas = floor(monto pagado / valor cuota), acotado a N. Saldo 0 ⇒ N cuotas. */
export function personalDebtProgress(debt: Pick<
  DebtRow,
  'debt_type' | 'balance_clp' | 'total_clp' | 'installments_total' | 'installment_amount_clp' | 'paid_off_at'
>): PersonalDebtProgress | null {
  if (debt.debt_type !== 'personal') return null;
  const installmentsTotal = Math.max(1, debt.installments_total ?? 1);
  const installmentAmount = Math.max(0, debt.installment_amount_clp ?? 0);
  const totalClp = Math.max(0, debt.total_clp ?? 0);

  if (debt.balance_clp <= 0 || debt.paid_off_at != null) {
    return { installmentsPaid: installmentsTotal, installmentsTotal, fraction: 1 };
  }

  if (installmentAmount <= 0 || totalClp <= 0) {
    return { installmentsPaid: 0, installmentsTotal, fraction: 0 };
  }

  const paidClp = Math.max(0, totalClp - debt.balance_clp);
  const installmentsPaid = Math.min(installmentsTotal, Math.floor(paidClp / installmentAmount));
  return {
    installmentsPaid,
    installmentsTotal,
    fraction: installmentsTotal > 0 ? installmentsPaid / installmentsTotal : 0,
  };
}

export function debtDefaultPartialPaymentClp(
  debt: Pick<DebtRow, 'debt_type' | 'minimum_payment_clp' | 'installment_amount_clp'>,
): number {
  if (debt.debt_type === 'personal' && (debt.installment_amount_clp ?? 0) > 0) {
    return debt.installment_amount_clp!;
  }
  return debt.minimum_payment_clp;
}

export function debtTypeLabel(type: DebtType): string {
  return type === 'personal' ? 'Deuda personal' : 'Tarjeta de crédito';
}
