import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { BodyText, Card, MoneyText, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { formatClp, parseClpInput } from '@/src/domain/money';
import { matchDebtIdForCategory, computeMonthTotals, type MonthPlanilla } from '@/src/domain/monthPlanilla';
import { listDebts, loadMonthPlanilla, saveMonthPlanilla } from '@/src/db/repository';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';
import type { DebtRow } from '@/src/db/schema';

interface Props {
  monthKey: string;
}

function LineEditor({
  label,
  amount,
  onChangeAmount,
  onRemove,
}: {
  label: string;
  amount: string;
  onChangeAmount: (v: string) => void;
  onRemove?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.lineRow}>
      <Text style={[styles.lineLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        value={amount}
        onChangeText={onChangeAmount}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.textSecondary}
        style={[styles.lineInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
      />
      {onRemove ? (
        <Pressable onPress={onRemove} accessibilityLabel={`Quitar ${label}`}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PlanillaEditor({ monthKey }: Props) {
  const db = useSQLiteContext();
  const { refresh, monthKeys, refreshMonthIndex } = useFinance();
  const colors = useThemeColors();
  const [planilla, setPlanilla] = useState<MonthPlanilla | null>(null);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMonthPlanilla(db, monthKey).then(setPlanilla);
    listDebts(db).then(setDebts);
  }, [db, monthKey]);

  const totals = useMemo(() => (planilla ? computeMonthTotals(planilla) : null), [planilla]);

  const updateFixed = (index: number, amount: string) => {
    if (!planilla) return;
    const v = parseClpInput(amount) ?? 0;
    const next = { ...planilla, fixedLines: [...planilla.fixedLines] };
    next.fixedLines[index] = { ...next.fixedLines[index], amountClp: v };
    setPlanilla(next);
  };

  const updateAdditional = (index: number, field: 'category' | 'amount', value: string) => {
    if (!planilla) return;
    const next = { ...planilla, additionalLines: [...planilla.additionalLines] };
    if (field === 'category') next.additionalLines[index].category = value;
    else next.additionalLines[index].amountClp = parseClpInput(value) ?? 0;
    setPlanilla(next);
  };

  const updateHousehold = (index: number, amount: string) => {
    if (!planilla) return;
    const v = parseClpInput(amount) ?? 0;
    const next = { ...planilla, householdLines: [...planilla.householdLines] };
    next.householdLines[index] = { ...next.householdLines[index], totalClp: v };
    setPlanilla(next);
  };

  const save = useCallback(async () => {
    if (!planilla) return;
    setSaving(true);
    try {
      const linked = {
        ...planilla,
        additionalLines: planilla.additionalLines.map((l) => ({
          ...l,
          debtId: matchDebtIdForCategory(l.category, debts) ?? l.debtId ?? null,
        })),
      };
      await saveMonthPlanilla(db, linked);
      await refreshMonthIndex();
      await refresh();
      Alert.alert('Guardado', 'Planilla del mes actualizada.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [planilla, db, debts, refresh, refreshMonthIndex]);

  if (!planilla || !totals) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Cargando planilla…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Card>
        <SectionTitle>Ingresos</SectionTitle>
        <LineEditor
          label="Total del mes"
          amount={planilla.incomeClp ? String(planilla.incomeClp) : ''}
          onChangeAmount={(v) => setPlanilla({ ...planilla, incomeClp: parseClpInput(v) ?? 0 })}
        />
      </Card>

      <Card>
        <SectionTitle>Gastos fijos</SectionTitle>
        {planilla.fixedLines.map((line, i) => (
          <LineEditor
            key={line.id}
            label={line.category}
            amount={line.amountClp ? String(line.amountClp) : ''}
            onChangeAmount={(v) => updateFixed(i, v)}
          />
        ))}
        <Pressable
          onPress={() =>
            setPlanilla({
              ...planilla,
              fixedLines: [
                ...planilla.fixedLines,
                { id: `f-${Date.now()}`, category: 'Nuevo ítem', amountClp: 0 },
              ],
            })
          }>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>+ Agregar ítem fijo</Text>
        </Pressable>
        <BodyText muted>Total fijos: {formatClp(totals.totalFixedClp)}</BodyText>
      </Card>

      <Card>
        <SectionTitle>Gastos adicionales</SectionTitle>
        {planilla.additionalLines.length === 0 ? (
          <BodyText muted>Diezmo, comida, pagos a deudas, imprevistos…</BodyText>
        ) : null}
        {planilla.additionalLines.map((line, i) => (
          <View key={line.id} style={{ gap: 4, marginBottom: spacing.sm }}>
            <TextInput
              value={line.category}
              onChangeText={(v) => updateAdditional(i, 'category', v)}
              placeholder="Nombre"
              placeholderTextColor={colors.textSecondary}
              style={[styles.lineInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <LineEditor
              label="Monto"
              amount={line.amountClp ? String(line.amountClp) : ''}
              onChangeAmount={(v) => updateAdditional(i, 'amount', v)}
              onRemove={() =>
                setPlanilla({
                  ...planilla,
                  additionalLines: planilla.additionalLines.filter((_, idx) => idx !== i),
                })
              }
            />
          </View>
        ))}
        <Pressable
          onPress={() =>
            setPlanilla({
              ...planilla,
              additionalLines: [
                ...planilla.additionalLines,
                { id: `a-${Date.now()}`, category: '', amountClp: 0 },
              ],
            })
          }>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>+ Agregar gasto adicional</Text>
        </Pressable>
        <BodyText muted>Total adicionales: {formatClp(totals.totalAdditionalClp)}</BodyText>
      </Card>

      <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
        <SectionTitle>Fondos menos gastos</SectionTitle>
        <MoneyText amountClp={totals.fondosMenosGastosClp} large />
        <BodyText muted>Ingresos − fijos − adicionales (como en tu Excel).</BodyText>
      </Card>

      <Card>
        <SectionTitle>Reserva</SectionTitle>
        <LineEditor
          label="Monto reservado"
          amount={planilla.reserveClp ? String(planilla.reserveClp) : ''}
          onChangeAmount={(v) => setPlanilla({ ...planilla, reserveClp: parseClpInput(v) ?? 0 })}
        />
      </Card>

      <Card>
        <SectionTitle>Gastos del mes general (hogar)</SectionTitle>
        <LineEditor
          label="Dividir entre N personas"
          amount={String(planilla.householdSplitPeople)}
          onChangeAmount={(v) => {
            const n = Number.parseInt(v, 10);
            setPlanilla({ ...planilla, householdSplitPeople: n >= 1 ? n : 1 });
          }}
        />
        {planilla.householdLines.map((line, i) => (
          <LineEditor
            key={line.id}
            label={`${line.category} (total hogar)`}
            amount={line.totalClp ? String(line.totalClp) : ''}
            onChangeAmount={(v) => updateHousehold(i, v)}
          />
        ))}
        <BodyText muted>
          Total hogar: {formatClp(totals.householdTotalClp)} · Tu parte:{' '}
          {formatClp(totals.householdYourShareClp)}
        </BodyText>
      </Card>

      <Pressable
        disabled={saving}
        onPress={save}
        style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
        <Text style={styles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar planilla del mes'}</Text>
      </Pressable>

      {monthKeys.length <= 1 ? (
        <BodyText muted>Tip: importá tu Excel en Ajustes para cargar varios meses de una.</BodyText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  lineLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  lineInput: {
    minWidth: 110,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 15,
    textAlign: 'right',
  },
  saveBtn: { borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
