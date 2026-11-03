import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { ClpInput } from '@/src/components/planilla/ClpInput';
import { BodyText, Card, MoneyText, Pill, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { formatClp } from '@/src/domain/money';
import { monthKeyToLabel } from '@/src/domain/monthPlanilla';
import {
  deleteDebt,
  listDebtPaymentHistory,
  listDebts,
  upsertDebt,
  type DebtPaymentHistoryRow,
} from '@/src/db/repository';
import type { DebtRow } from '@/src/db/schema';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

interface DebtForm {
  id: string;
  name: string;
  balance_clp: number;
  minimum_payment_clp: number;
  interest_rate_bps: number;
}

function emptyForm(): DebtForm {
  return {
    id: id(),
    name: '',
    balance_clp: 0,
    minimum_payment_clp: 0,
    interest_rate_bps: 1800,
  };
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

  const openCreate = () => {
    setForm(emptyForm());
    setEditing(false);
    setModalOpen(true);
  };

  const openEdit = (d: DebtRow) => {
    setForm({
      id: d.id,
      name: d.name,
      balance_clp: d.balance_clp,
      minimum_payment_clp: d.minimum_payment_clp,
      interest_rate_bps: d.interest_rate_bps,
    });
    setEditing(true);
    setModalOpen(true);
  };

  const saveDebt = async () => {
    if (!form.name.trim()) {
      Alert.alert('Nombre requerido', 'Ingresá un nombre para la deuda.');
      return;
    }
    await upsertDebt(db, {
      id: form.id,
      name: form.name.trim(),
      balance_clp: Math.max(0, form.balance_clp),
      minimum_payment_clp: Math.max(0, form.minimum_payment_clp),
      interest_rate_bps: Math.max(0, form.interest_rate_bps),
      paid_off_at: form.balance_clp <= 0 ? new Date().toISOString() : null,
    });
    setModalOpen(false);
    await reload();
    await refresh();
  };

  const confirmDelete = (d: DebtRow) => {
    Alert.alert('Eliminar deuda', `¿Eliminar "${d.name}"? No borra pagos ya registrados en meses cerrados.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteDebt(db, d.id);
          await reload();
          await refresh();
        },
      },
    ]);
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
        return (
          <Card key={d.id}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.name, { color: colors.text }]}>{d.name}</Text>
                {paidOff ? <Pill label="Saldada" tone="ok" /> : null}
              </View>
              <MoneyText amountClp={d.balance_clp} />
            </View>
            <BodyText muted>
              Cuota mín.: {formatClp(d.minimum_payment_clp)} · Tasa: {(d.interest_rate_bps / 100).toFixed(1)}% anual
            </BodyText>
            <View style={styles.actions}>
              <Pressable onPress={() => openEdit(d)}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(d)}>
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
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editing ? 'Editar deuda' : 'Nueva deuda'}
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Nombre</Text>
            <TextInput
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              placeholder="Ej. Tarjeta Banco X"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Saldo actual</Text>
            <ClpInput amountClp={form.balance_clp} onChangeAmount={(v) => setForm({ ...form, balance_clp: v })} />
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
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalOpen(false)} style={styles.modalBtn}>
                <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={saveDebt} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar</Text>
              </Pressable>
            </View>
          </View>
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: spacing.xs },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  modalBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md },
});
