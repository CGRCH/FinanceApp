import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ClpInput } from '@/src/components/planilla/ClpInput';
import { BodyText, SectionTitle } from '@/src/components/ui/Primitives';
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

export function PlanillaDebtPayments({ db, monthKey, planilla, activeDebts, persistPlanilla, persisting }: Props) {
  const colors = useThemeColors();
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(activeDebts[0]?.id ?? null);
  const [recordsByDebt, setRecordsByDebt] = useState<Record<string, InstallmentPaymentRecord[]>>({});

  useEffect(() => {
    if (activeDebts.length === 0) {
      setSelectedDebtId(null);
      return;
    }
    if (!selectedDebtId || !activeDebts.some((d) => d.id === selectedDebtId)) {
      setSelectedDebtId(activeDebts[0].id);
    }
  }, [activeDebts, selectedDebtId]);

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

  const selectedDebt = activeDebts.find((d) => d.id === selectedDebtId) ?? null;
  const installmentStates = useMemo(() => {
    if (!selectedDebt || selectedDebt.debt_type !== 'personal') return [];
    const records = recordsByDebt[selectedDebt.id] ?? [];
    return computeInstallmentStates(selectedDebt, records);
  }, [selectedDebt, recordsByDebt]);

  const updateLines = async (lines: DebtPaymentLine[]) => {
    await persistPlanilla({ ...planilla, debtPaymentLines: lines });
    if (selectedDebt?.debt_type === 'personal') {
      await loadRecords(selectedDebt.id);
    }
  };

  const setLinePaid = async (lineId: string, paid: boolean) => {
    const lines = planilla.debtPaymentLines.map((l) => (l.id === lineId ? { ...l, paid } : l));
    await updateLines(lines);
  };

  const linesThisMonth = planilla.debtPaymentLines;

  if (activeDebts.length === 0) {
    return (
      <>
        <SectionTitle>Pagos de deudas</SectionTitle>
        <BodyText muted>No hay deudas activas. Crea una en la pestaña Deudas.</BodyText>
      </>
    );
  }

  return (
    <>
      <SectionTitle>Pagos de deudas</SectionTitle>
      <BodyText muted>
        Elige la deuda. Marca Pagado cuando el pago esté hecho; se actualiza el saldo y Disponible al instante.
      </BodyText>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Deuda</Text>
      <View style={styles.chipRow}>
        {activeDebts.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => setSelectedDebtId(d.id)}
            style={[
              styles.chip,
              {
                borderColor: selectedDebtId === d.id ? colors.primary : colors.border,
                backgroundColor: selectedDebtId === d.id ? colors.primarySoft : colors.surface,
              },
            ]}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{d.name}</Text>
          </Pressable>
        ))}
      </View>

      {selectedDebt?.debt_type === 'personal' ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <View style={styles.kindRow}>
            <Pressable
              onPress={() =>
                void updateLines(replaceWithFullPaymentLine(linesThisMonth, selectedDebt.id, selectedDebt.balance_clp))
              }
              style={[styles.kindBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Pago total</Text>
            </Pressable>
            <BodyText muted>Saldo pendiente: {formatClp(selectedDebt.balance_clp)}</BodyText>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Cuotas (abono)</Text>
          {installmentStates.map((st) => {
            const line = linesThisMonth.find(
              (l) => l.debtId === selectedDebt.id && l.installmentIndex === st.index,
            );
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
                          const next = setInstallmentIncludedInPlanilla(
                            linesThisMonth,
                            selectedDebt,
                            st.index,
                            v,
                          );
                          void updateLines(next);
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
      ) : selectedDebt ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <View style={styles.kindRow}>
            <Pressable
              onPress={() => {
                const fullLine: DebtPaymentLine = {
                  id: `dp-${Date.now()}`,
                  debtId: selectedDebt.id,
                  paymentKind: 'full',
                  amountClp: selectedDebt.balance_clp,
                  paid: false,
                };
                void updateLines([...linesThisMonth.filter((l) => l.debtId !== selectedDebt.id), fullLine]);
              }}
              style={[styles.kindBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Pago total</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const partial: DebtPaymentLine = {
                  id: `dp-${Date.now()}`,
                  debtId: selectedDebt.id,
                  paymentKind: 'partial',
                  amountClp: debtDefaultPartialPaymentClp(selectedDebt),
                  paid: false,
                };
                void updateLines([...linesThisMonth, partial]);
              }}
              style={[styles.kindBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Abono</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {linesThisMonth.length > 0 ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Líneas del mes</Text>
          {linesThisMonth
            .filter((line) => {
              const debt = activeDebts.find((d) => d.id === line.debtId);
              if (!debt) return false;
              if (debt.debt_type === 'personal' && line.installmentIndex != null) return false;
              return true;
            })
            .map((line) => {
            const debt = activeDebts.find((d) => d.id === line.debtId);
            if (!debt) return null;
            const title =
              line.installmentIndex != null
                ? `${debt.name} · Cuota ${line.installmentIndex}`
                : line.paymentKind === 'full'
                  ? `${debt.name} · Pago total`
                  : `${debt.name} · Abono`;
            return (
              <View key={line.id} style={[styles.lineCard, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{title}</Text>
                {debt.debt_type === 'credit_card' && line.paymentKind === 'partial' ? (
                  <ClpInput
                    amountClp={line.amountClp}
                    onChangeAmount={(v) => {
                      const lines = linesThisMonth.map((l) => (l.id === line.id ? { ...l, amountClp: v } : l));
                      void updateLines(lines);
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
                    onPress={() => void updateLines(linesThisMonth.filter((l) => l.id !== line.id))}>
                    <Text style={{ color: colors.danger, fontWeight: '700' }}>Quitar</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {persisting ? (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Guardando…</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: 8 },
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
