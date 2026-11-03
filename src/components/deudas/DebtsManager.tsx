import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { ClpInput } from '@/src/components/planilla/ClpInput';
import { BodyText, Card, MoneyText, Pill, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { formatClp } from '@/src/domain/money';
import { monthKeyToLabel } from '@/src/domain/monthPlanilla';
import {
  debtTypeLabel,
  debtDefaultPartialPaymentClp,
  personalDebtProgress,
  suggestInstallmentAmountClp,
} from '@/src/domain/personalDebt';
import {
  deleteDebt,
  listDebtPaymentHistory,
  listDebts,
  upsertDebt,
  type DebtPaymentHistoryRow,
} from '@/src/db/repository';
import type { DebtRow, DebtType } from '@/src/db/schema';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { confirmAsync } from '@/src/utils/confirm';
import { radii, spacing } from '@/src/theme/tokens';

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

interface DebtForm {
  id: string;
  debt_type: DebtType;
  name: string;
  balance_clp: number;
  minimum_payment_clp: number;
  interest_rate_bps: number;
  total_clp: number;
  installments_total: number;
  installment_amount_clp: number;
}

function emptyForm(type: DebtType = 'credit_card'): DebtForm {
  return {
    id: id(),
    debt_type: type,
    name: '',
    balance_clp: 0,
    minimum_payment_clp: 0,
    interest_rate_bps: 1800,
    total_clp: 0,
    installments_total: 12,
    installment_amount_clp: 0,
  };
}

function rowToForm(d: DebtRow): DebtForm {
  return {
    id: d.id,
    debt_type: d.debt_type ?? 'credit_card',
    name: d.name,
    balance_clp: d.balance_clp,
    minimum_payment_clp: d.minimum_payment_clp,
    interest_rate_bps: d.interest_rate_bps,
    total_clp: d.total_clp ?? d.balance_clp,
    installments_total: d.installments_total ?? 1,
    installment_amount_clp: d.installment_amount_clp ?? d.minimum_payment_clp,
  };
}

function ProgressBar({ fraction, color }: { fraction: number; color: string }) {
  const pct = Math.max(0, Math.min(1, fraction));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function DebtsManager() {
  const db = useSQLiteContext();
  const { debtComparison, extraDebtPaymentClp, refresh } = useFinance();
  const colors = useThemeColors();
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [history, setHistory] = useState<DebtPaymentHistoryRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<DebtForm>(emptyForm());
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    setDebts(await listDebts(db));
    setHistory(await listDebtPaymentHistory(db));
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload, debtComparison]);

  const setDebtType = (debt_type: DebtType) => {
    setForm((f) => {
      const next = { ...f, debt_type };
      if (debt_type === 'personal' && !editing) {
        next.interest_rate_bps = 0;
        if (next.total_clp > 0 && next.installments_total > 0) {
          next.installment_amount_clp = suggestInstallmentAmountClp(next.total_clp, next.installments_total);
        }
      }
      return next;
    });
  };

  const openCreate = () => {
    setForm(emptyForm());
    setEditing(false);
    setModalOpen(true);
  };

  const openEdit = (d: DebtRow) => {
    setForm(rowToForm(d));
    setEditing(true);
    setModalOpen(true);
  };

  const saveDebt = async () => {
    if (!form.name.trim()) {
      Alert.alert('Nombre requerido', 'Ingresá un nombre para la deuda.');
      return;
    }

    if (form.debt_type === 'personal') {
      const total = Math.max(0, form.total_clp);
      const installments = Math.max(1, Math.floor(form.installments_total));
      const installment = Math.max(0, form.installment_amount_clp);
      if (total <= 0 || installment <= 0) {
        Alert.alert('Datos incompletos', 'Indicá monto total y valor de cada cuota.');
        return;
      }
      const balance = editing ? Math.max(0, form.balance_clp) : total;
      await upsertDebt(db, {
        id: form.id,
        name: form.name.trim(),
        balance_clp: balance,
        minimum_payment_clp: installment,
        interest_rate_bps: 0,
        debt_type: 'personal',
        total_clp: total,
        installments_total: installments,
        installment_amount_clp: installment,
        paid_off_at: balance <= 0 ? new Date().toISOString() : null,
      });
    } else {
      await upsertDebt(db, {
        id: form.id,
        name: form.name.trim(),
        balance_clp: Math.max(0, form.balance_clp),
        minimum_payment_clp: Math.max(0, form.minimum_payment_clp),
        interest_rate_bps: Math.max(0, form.interest_rate_bps),
        debt_type: 'credit_card',
        total_clp: null,
        installments_total: null,
        installment_amount_clp: null,
        paid_off_at: form.balance_clp <= 0 ? new Date().toISOString() : null,
      });
    }

    setModalOpen(false);
    await reload();
    await refresh();
  };

  const onConfirmDelete = async (d: DebtRow) => {
    const ok = await confirmAsync(
      'Eliminar deuda',
      `¿Eliminar "${d.name}"? Se quitan sus pagos del mes actual y meses futuros abiertos. El historial de meses cerrados se mantiene.`,
      'Eliminar',
    );
    if (!ok) return;
    await deleteDebt(db, d.id);
    await reload();
    await refresh();
  };

  const activeTotal = debts.filter((d) => d.balance_clp > 0).reduce((s, d) => s + d.balance_clp, 0);

  return (
    <>
      <Pressable
        onPress={openCreate}
        style={[styles.addBtn, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel="Agregar deuda">
        <Text style={styles.addBtnText}>+ Agregar deuda</Text>
      </Pressable>

      <Card>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Total adeudado</Text>
        <MoneyText amountClp={activeTotal} large />
        <BodyText muted>Abono extra mensual (Ajustes): {formatClp(extraDebtPaymentClp)}</BodyText>
      </Card>

      {debts.map((d) => {
        const paidOff = d.balance_clp <= 0 || d.paid_off_at != null;
        const progress = personalDebtProgress(d);
        return (
          <Card key={d.id}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.name, { color: colors.text }]}>{d.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{debtTypeLabel(d.debt_type)}</Text>
                {paidOff ? <Pill label="Saldada" tone="ok" /> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Saldo pendiente</Text>
                <MoneyText amountClp={d.balance_clp} />
              </View>
            </View>

            {d.debt_type === 'personal' && progress ? (
              <View style={{ gap: 6, marginTop: spacing.sm }}>
                <BodyText muted>
                  Cuotas pagadas {progress.installmentsPaid} de {progress.installmentsTotal} · Valor cuota{' '}
                  {formatClp(d.installment_amount_clp ?? 0)}
                </BodyText>
                <ProgressBar fraction={progress.fraction} color={colors.primary} />
              </View>
            ) : (
              <BodyText muted>
                Cuota mín.: {formatClp(d.minimum_payment_clp)} · Tasa: {(d.interest_rate_bps / 100).toFixed(1)}% anual
              </BodyText>
            )}

            <View style={styles.actions}>
              <Pressable onPress={() => openEdit(d)}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => void onConfirmDelete(d)}>
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Eliminar</Text>
              </Pressable>
            </View>
          </Card>
        );
      })}

      {history.length > 0 ? (
        <Card>
          <SectionTitle>Historial de abonos</SectionTitle>
          {history.slice(0, 12).map((h) => {
            const debt = debts.find((d) => d.id === h.debt_id);
            return (
              <View key={h.id} style={[styles.historyRow, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{debt?.name ?? 'Deuda'}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {monthKeyToLabel(h.month_key)} · {h.note === 'full' ? 'Pago total' : 'Abono'}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(h.amount_clp)}</Text>
              </View>
            );
          })}
        </Card>
      ) : null}

      {debtComparison ? (
        <Card>
          <SectionTitle>Estrategias de pago</SectionTitle>
          <View style={styles.strategyRow}>
            <View style={[styles.strategyBox, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.strategyTitle, { color: colors.text }]}>Bola de nieve</Text>
              <BodyText>{debtComparison.snowball.months} meses</BodyText>
              <BodyText muted>Interés est.: {formatClp(debtComparison.snowball.totalInterestClp)}</BodyText>
              <Pill
                label={
                  debtComparison.snowball.debtFreeMonth
                    ? `Libre ${debtComparison.snowball.debtFreeMonth}`
                    : 'Sin fecha'
                }
                tone="neutral"
              />
            </View>
            <View style={[styles.strategyBox, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.strategyTitle, { color: colors.text }]}>Avalancha</Text>
              <BodyText>{debtComparison.avalanche.months} meses</BodyText>
              <BodyText muted>Interés est.: {formatClp(debtComparison.avalanche.totalInterestClp)}</BodyText>
              <Pill
                label={
                  debtComparison.avalanche.debtFreeMonth
                    ? `Libre ${debtComparison.avalanche.debtFreeMonth}`
                    : 'Sin fecha'
                }
                tone="neutral"
              />
            </View>
          </View>
          <Pill
            label={`Recomendación: ${debtComparison.recommended === 'snowball' ? 'Bola de nieve' : 'Avalancha'}`}
            tone="ok"
          />
          <BodyText>{debtComparison.summary}</BodyText>
        </Card>
      ) : null}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editing ? 'Editar deuda' : 'Nueva deuda'}
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Tipo</Text>
              <View style={styles.typeRow}>
                {(['credit_card', 'personal'] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setDebtType(t)}
                    style={[
                      styles.typeChip,
                      {
                        borderColor: form.debt_type === t ? colors.primary : colors.border,
                        backgroundColor: form.debt_type === t ? colors.surfaceMuted : colors.surface,
                      },
                    ]}>
                    <Text style={{ color: colors.text, fontWeight: form.debt_type === t ? '800' : '600', fontSize: 13 }}>
                      {debtTypeLabel(t)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                {form.debt_type === 'personal' ? 'Nombre (a quién le debo)' : 'Nombre'}
              </Text>
              <TextInput
                value={form.name}
                onChangeText={(name) => setForm({ ...form, name })}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder={form.debt_type === 'personal' ? 'Ej. Juan' : 'Ej. Tarjeta Banco X'}
                placeholderTextColor={colors.textSecondary}
              />

              {form.debt_type === 'credit_card' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Saldo actual</Text>
                  <ClpInput
                    amountClp={form.balance_clp}
                    onChangeAmount={(v) => setForm({ ...form, balance_clp: v })}
                  />
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Cuota mínima</Text>
                  <ClpInput
                    amountClp={form.minimum_payment_clp}
                    onChangeAmount={(v) => setForm({ ...form, minimum_payment_clp: v })}
                  />
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Tasa anual (%)</Text>
                  <TextInput
                    value={String(form.interest_rate_bps / 100)}
                    keyboardType="decimal-pad"
                    onChangeText={(t) => {
                      const n = Number.parseFloat(t.replace(',', '.'));
                      if (!Number.isNaN(n)) setForm({ ...form, interest_rate_bps: Math.round(n * 100) });
                    }}
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Monto total</Text>
                  <ClpInput
                    amountClp={form.total_clp}
                    onChangeAmount={(v) => {
                      const installment_amount_clp =
                        form.installments_total > 0
                          ? suggestInstallmentAmountClp(v, form.installments_total)
                          : form.installment_amount_clp;
                      setForm({
                        ...form,
                        total_clp: v,
                        installment_amount_clp,
                        balance_clp: editing ? form.balance_clp : v,
                      });
                    }}
                  />
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Cuotas acordadas</Text>
                  <TextInput
                    value={String(form.installments_total)}
                    keyboardType="number-pad"
                    onChangeText={(t) => {
                      const n = Math.max(1, Number.parseInt(t.replace(/\D/g, ''), 10) || 1);
                      const installment_amount_clp = suggestInstallmentAmountClp(form.total_clp, n);
                      setForm({ ...form, installments_total: n, installment_amount_clp });
                    }}
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  />
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Monto de cada cuota</Text>
                  <ClpInput
                    amountClp={form.installment_amount_clp}
                    onChangeAmount={(v) => setForm({ ...form, installment_amount_clp: v })}
                  />
                  {editing ? (
                    <BodyText muted>Saldo pendiente: {formatClp(form.balance_clp)} (se actualiza con pagos en la planilla)</BodyText>
                  ) : null}
                </>
              )}

              <View style={styles.modalActions}>
                <Pressable onPress={() => setModalOpen(false)} style={styles.modalBtn}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={() => void saveDebt()} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  addBtn: { borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center', marginBottom: spacing.sm },
  addBtnText: { color: '#fff', fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  name: { fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  historyRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm, gap: 2 },
  strategyRow: { flexDirection: 'row', gap: spacing.sm },
  strategyBox: { flex: 1, borderRadius: 12, padding: spacing.sm, gap: 4 },
  strategyTitle: { fontWeight: '700' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.25)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: spacing.xs },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  modalBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md },
});
