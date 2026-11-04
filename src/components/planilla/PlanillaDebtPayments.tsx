import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ClpInput } from '@/src/components/planilla/ClpInput';
import { AccordionSection } from '@/src/components/ui/AccordionSection';
import { BodyText } from '@/src/components/ui/Primitives';
import {
  computeInstallmentStates,
  replaceWithFullPaymentLine,
  setInstallmentIncludedInPlanilla,
  type InstallmentPaymentRecord,
} from '@/src/domain/debtInstallments';
import { formatClp } from '@/src/domain/money';
import { monthKeyToLabel } from '@/src/domain/monthPlanilla';
import type { DebtPaymentLine, MonthPlanilla } from '@/src/domain/monthPlanilla';
import { debtDefaultPartialPaymentClp } from '@/src/domain/personalDebt';
import { listDebtPaymentRecords } from '@/src/db/repository';
import type { DebtRow } from '@/src/db/schema';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';
import type { SQLiteDatabase } from 'expo-sqlite';

interface Props {
  db: SQLiteDatabase;
  monthKey: string;
  planilla: MonthPlanilla;
  activeDebts: DebtRow[];
  persistPlanilla: (next: MonthPlanilla) => Promise<void>;
  persisting: boolean;
}

function linesForDebt(lines: DebtPaymentLine[], debtId: string): DebtPaymentLine[] {
  return lines.filter((l) => l.debtId === debtId);
}

function paidTotalClp(lines: DebtPaymentLine[]): number {
  return lines.filter((l) => l.paid).reduce((sum, l) => sum + l.amountClp, 0);
}

function sectionSummary(debts: DebtRow[], lines: DebtPaymentLine[]): string {
  if (debts.length === 0) return 'Sin deudas activas';
  const paid = paidTotalClp(lines);
  const n = debts.length;
  return `${n} ${n === 1 ? 'deuda' : 'deudas'} · ${formatClp(paid)} pagado este mes`;
}

function debtSummary(debt: DebtRow, lines: DebtPaymentLine[]): string {
  const debtLines = linesForDebt(lines, debt.id);
  const paid = paidTotalClp(debtLines);
  const inPlan = debtLines.length;
  if (inPlan === 0 && paid === 0) {
    return debt.debt_type === 'personal' ? 'Sin cuotas en planilla' : 'Sin pago en planilla';
  }
  const parts: string[] = [];
  if (inPlan > 0) parts.push(`${inPlan} ${inPlan === 1 ? 'línea' : 'líneas'} en planilla`);
  if (paid > 0) parts.push(`${formatClp(paid)} pagado`);
  return parts.join(' · ');
}

export function PlanillaDebtPayments({ db, monthKey, planilla, activeDebts, persistPlanilla, persisting }: Props) {
  const colors = useThemeColors();
  const [recordsByDebt, setRecordsByDebt] = useState<Record<string, InstallmentPaymentRecord[]>>({});

  const loadRecords = useCallback(
    async (debtId: string) => {
      const records = await listDebtPaymentRecords(db, debtId);
      setRecordsByDebt((prev) => ({ ...prev, [debtId]: records }));
    },
    [db],
  );

  useEffect(() => {
    for (const d of activeDebts.filter((x) => x.debt_type === 'personal')) {
      void loadRecords(d.id);
    }
  }, [activeDebts, loadRecords, planilla.debtPaymentLines]);

  const linesThisMonth = planilla.debtPaymentLines;
  const outerSummary = useMemo(() => sectionSummary(activeDebts, linesThisMonth), [activeDebts, linesThisMonth]);

  const updateLines = async (lines: DebtPaymentLine[], reloadDebtId?: string) => {
    await persistPlanilla({ ...planilla, debtPaymentLines: lines });
    if (reloadDebtId) {
      const debt = activeDebts.find((d) => d.id === reloadDebtId);
      if (debt?.debt_type === 'personal') {
        await loadRecords(reloadDebtId);
      }
    }
  };

  const setLinePaid = async (lineId: string, paid: boolean) => {
    const line = linesThisMonth.find((l) => l.id === lineId);
    const lines = linesThisMonth.map((l) => (l.id === lineId ? { ...l, paid } : l));
    await updateLines(lines, line?.debtId);
  };

  const renderCreditCardLines = (debt: DebtRow) => {
    const cardLines = linesForDebt(linesThisMonth, debt.id).filter((line) => line.installmentIndex == null);
    if (cardLines.length === 0) return null;
    return (
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Líneas del mes</Text>
        {cardLines.map((line) => {
          const title =
            line.paymentKind === 'full' ? `${debt.name} · Pago total` : `${debt.name} · Abono`;
          return (
            <View key={line.id} style={[styles.lineCard, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{title}</Text>
              {line.paymentKind === 'partial' ? (
                <ClpInput
                  amountClp={line.amountClp}
                  onChangeAmount={(v) => {
                    const lines = linesThisMonth.map((l) => (l.id === line.id ? { ...l, amountClp: v } : l));
                    void updateLines(lines, debt.id);
                  }}
                />
              ) : (
                <BodyText muted>{formatClp(line.amountClp)}</BodyText>
              )}
              <View style={styles.lineFooter}>
                <View style={styles.paidInline}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Pagado</Text>
                  <Switch
                    value={!!line.paid}
                    disabled={persisting}
                    onValueChange={(v) => void setLinePaid(line.id, v)}
                  />
                </View>
                <Pressable
                  disabled={persisting || line.paid}
                  onPress={() => void updateLines(linesThisMonth.filter((l) => l.id !== line.id), debt.id)}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>Quitar</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderPersonalInstallments = (debt: DebtRow) => {
    const records = recordsByDebt[debt.id] ?? [];
    const installmentStates = computeInstallmentStates(debt, records);
    return (
      <View style={{ gap: spacing.sm }}>
        <View style={styles.kindRow}>
          <Pressable
            onPress={() =>
              void updateLines(replaceWithFullPaymentLine(linesThisMonth, debt.id, debt.balance_clp), debt.id)
            }
            style={[styles.kindBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Pago total</Text>
          </Pressable>
          <BodyText muted>Saldo pendiente: {formatClp(debt.balance_clp)}</BodyText>
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Cuotas (abono)</Text>
        {installmentStates.map((st) => {
          const line = linesThisMonth.find((l) => l.debtId === debt.id && l.installmentIndex === st.index);
          const included = line != null;
          return (
            <View key={st.index} style={[styles.installRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  Cuota {st.index} · {formatClp(st.amountClp)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {st.status === 'pagada'
                    ? `Pagada${st.paidMonthKey ? ` (${monthKeyToLabel(st.paidMonthKey)})` : ''}`
                    : 'Pendiente'}
                </Text>
              </View>
              {st.status === 'pagada' ? null : (
                <>
                  <View style={styles.paidInline}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Este mes</Text>
                    <Switch
                      value={included}
                      disabled={persisting || (line?.paid ?? false)}
                      onValueChange={(v) => {
                        const next = setInstallmentIncludedInPlanilla(linesThisMonth, debt, st.index, v);
                        void updateLines(next, debt.id);
                      }}
                    />
                  </View>
                  {line ? (
                    <View style={styles.paidInline}>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Pagado</Text>
                      <Switch
                        value={!!line.paid}
                        disabled={persisting}
                        onValueChange={(v) => void setLinePaid(line.id, v)}
                      />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderCreditCardActions = (debt: DebtRow) => (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.kindRow}>
        <Pressable
          onPress={() => {
            const fullLine: DebtPaymentLine = {
              id: `dp-${Date.now()}`,
              debtId: debt.id,
              paymentKind: 'full',
              amountClp: debt.balance_clp,
              paid: false,
            };
            void updateLines([...linesThisMonth.filter((l) => l.debtId !== debt.id), fullLine], debt.id);
          }}
          style={[styles.kindBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Pago total</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const partial: DebtPaymentLine = {
              id: `dp-${Date.now()}`,
              debtId: debt.id,
              paymentKind: 'partial',
              amountClp: debtDefaultPartialPaymentClp(debt),
              paid: false,
            };
            void updateLines([...linesThisMonth, partial], debt.id);
          }}
          style={[styles.kindBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Abono</Text>
        </Pressable>
      </View>
      {renderCreditCardLines(debt)}
    </View>
  );

  return (
    <AccordionSection title="Pagos de deudas" summary={outerSummary} defaultExpanded={false}>
      {activeDebts.length === 0 ? (
        <BodyText muted>No hay deudas activas. Crea una en la pestaña Deudas.</BodyText>
      ) : (
        <>
          <BodyText muted>
            Expande cada deuda para registrar pagos. Marca Pagado cuando el pago esté hecho; se actualiza el saldo y
            Disponible al instante.
          </BodyText>
          {activeDebts.map((debt) => (
            <AccordionSection key={debt.id} title={debt.name} summary={debtSummary(debt, linesThisMonth)}>
              {debt.debt_type === 'personal' ? renderPersonalInstallments(debt) : renderCreditCardActions(debt)}
            </AccordionSection>
          ))}
        </>
      )}

      {persisting ? (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Guardando…</Text>
        </View>
      ) : null}
    </AccordionSection>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  kindBtn: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  installRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  paidInline: { alignItems: 'center', gap: 2 },
  lineCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.sm, padding: spacing.sm, gap: spacing.xs },
  lineFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
});
