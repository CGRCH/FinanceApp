import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { ClpInput } from '@/src/components/planilla/ClpInput';
import { AccordionSection } from '@/src/components/ui/AccordionSection';
import { BodyText, Card, MoneyText, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { isMonthEditable, monthEditability, monthEditabilityLabel } from '@/src/domain/monthEditability';
import { applyDiezmoToPlanilla, diezmoHintLabel, isDiezmoCategory } from '@/src/domain/diezmo';
import { formatClp } from '@/src/domain/money';
import { lineSplitDivisor } from '@/src/domain/sharedLineSplits';
import {
  computeMonthTotals,
  computeSharedSplitTotals,
  matchDebtIdForCategory,
  type MonthPlanilla,
  type PlanillaLine,
} from '@/src/domain/monthPlanilla';
import { computePlanillaBreakdown } from '@/src/domain/planillaBreakdown';
import { PlanillaCalculationBreakdown } from '@/src/components/planilla/PlanillaCalculationBreakdown';
import { PlanillaDebtPayments } from '@/src/components/planilla/PlanillaDebtPayments';
import { listDebts, loadMonthPlanilla, saveMonthPlanilla } from '@/src/db/repository';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';
import type { DebtRow } from '@/src/db/schema';

interface Props {
  monthKey: string;
}

function EditableLineRow({
  line,
  onCategoryChange,
  onAmountChange,
  onRemove,
  categoryEditable,
  readOnly,
  onPaidChange,
  showPaidToggle,
  splitDivisor,
  categoryLabelOnly,
  lockAmount,
  amountHint,
}: {
  line: PlanillaLine;
  onCategoryChange?: (v: string) => void;
  onAmountChange: (clp: number) => void;
  onRemove?: () => void;
  categoryEditable?: boolean;
  readOnly?: boolean;
  onPaidChange?: (paid: boolean) => void;
  showPaidToggle?: boolean;
  splitDivisor?: number | null;
  /** Nombre solo lectura con el mismo layout que el input editable (flex:1). */
  categoryLabelOnly?: boolean;
  /** Monto calculado (p. ej. Diezmo); Pagado y división siguen editables si el mes lo permite. */
  lockAmount?: boolean;
  amountHint?: string;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.lineCard}>
      <View style={styles.lineMainRow}>
        {categoryEditable && !readOnly ? (
          <TextInput
            value={line.category}
            onChangeText={onCategoryChange}
            editable={!readOnly}
            placeholder="Nombre"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.categoryInputCompact,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          />
        ) : categoryLabelOnly ? (
          <View
            style={[
              styles.categoryInputCompact,
              styles.categoryLabelBox,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}>
            <Text style={[styles.categoryLabelText, { color: colors.text }]} numberOfLines={1}>
              {line.category}
            </Text>
          </View>
        ) : (
          <Text style={[styles.lineTitle, { color: colors.text }]} numberOfLines={1}>
            {line.category}
          </Text>
        )}
        <ClpInput
          amountClp={line.amountClp}
          onChangeAmount={onAmountChange}
          style={styles.amountCompact}
          editable={!readOnly && !lockAmount}
          splitDivisor={splitDivisor ?? undefined}
        />
        {showPaidToggle ? (
          <View style={styles.paidInline}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Pagado</Text>
            <Switch
              value={!!line.paid}
              disabled={readOnly}
              onValueChange={(v) => onPaidChange?.(v)}
              accessibilityLabel={`Marcar ${line.category} como pagado`}
            />
          </View>
        ) : null}
        {onRemove && !readOnly ? (
          <Pressable onPress={onRemove} accessibilityLabel="Eliminar ítem" style={styles.removeBtn}>
            <Text style={{ color: colors.danger, fontWeight: '800' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {amountHint ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{amountHint}</Text>
      ) : null}
      {splitDivisor && splitDivisor >= 2 && line.amountClp > 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
          total {formatClp(line.amountClp)} ÷ {splitDivisor}
        </Text>
      ) : null}
    </View>
  );
}

export function PlanillaEditor({ monthKey }: Props) {
  const db = useSQLiteContext();
  const { refresh, refreshMonthIndex, fixedTemplateRevision } = useFinance();
  const colors = useThemeColors();
  const [planilla, setPlanilla] = useState<MonthPlanilla | null>(null);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [debtPersisting, setDebtPersisting] = useState(false);

  const reloadPlanilla = useCallback(async () => {
    const [loaded, debtRows] = await Promise.all([loadMonthPlanilla(db, monthKey), listDebts(db)]);
    setPlanilla(loaded);
    setDebts(debtRows);
  }, [db, monthKey]);

  useEffect(() => {
    void reloadPlanilla();
  }, [reloadPlanilla, fixedTemplateRevision]);

  useFocusEffect(
    useCallback(() => {
      void reloadPlanilla();
    }, [reloadPlanilla]),
  );

  const debtBalances = useMemo(
    () => Object.fromEntries(debts.map((d) => [d.id, d.balance_clp])),
    [debts],
  );

  const debtNames = useMemo(
    () => Object.fromEntries(debts.map((d) => [d.id, d.name])),
    [debts],
  );

  const breakdown = useMemo(
    () => (planilla ? computePlanillaBreakdown(planilla, debtBalances, debtNames) : null),
    [planilla, debtBalances, debtNames],
  );
  const totals = breakdown?.totals ?? null;
  const shared = useMemo(() => (planilla ? computeSharedSplitTotals(planilla) : null), [planilla]);
  const editable = isMonthEditable(monthKey);
  const editMode = monthEditability(monthKey);

  const toggleSharedLine = (lineId: string, enabled: boolean) => {
    if (!planilla || !editable) return;
    const splits = { ...(planilla.sharedLineSplits ?? {}) };
    if (enabled) splits[lineId] = splits[lineId] ?? 2;
    else delete splits[lineId];
    setPlanilla({ ...planilla, sharedLineSplits: splits });
  };

  const setLineSplitDivisor = (lineId: string, people: number) => {
    if (!planilla || !editable) return;
    const n = Math.max(2, people);
    setPlanilla({
      ...planilla,
      sharedLineSplits: { ...(planilla.sharedLineSplits ?? {}), [lineId]: n },
    });
  };

  const removeSplitForLine = (lineId: string) => {
    const splits = { ...(planilla?.sharedLineSplits ?? {}) };
    delete splits[lineId];
    return splits;
  };

  const splittableLines = useMemo(() => {
    if (!planilla) return [];
    return [...planilla.fixedLines, ...planilla.additionalLines].filter((l) => l.amountClp > 0);
  }, [planilla]);

  const activeDebts = useMemo(() => debts.filter((d) => d.balance_clp > 0), [debts]);

  const persistPlanillaNow = useCallback(
    async (next: MonthPlanilla) => {
      if (!editable) return;
      setDebtPersisting(true);
      try {
        const linked = {
          ...next,
          additionalLines: next.additionalLines.map((l) => ({
            ...l,
            debtId: matchDebtIdForCategory(l.category, debts) ?? l.debtId ?? null,
          })),
        };
        await saveMonthPlanilla(db, linked);
        await refreshMonthIndex();
        await refresh();
        const [loaded, debtRows] = await Promise.all([loadMonthPlanilla(db, monthKey), listDebts(db)]);
        setPlanilla(loaded);
        setDebts(debtRows);
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
        await reloadPlanilla();
      } finally {
        setDebtPersisting(false);
      }
    },
    [db, debts, editable, monthKey, refresh, refreshMonthIndex, reloadPlanilla],
  );

  const save = useCallback(async () => {
    if (!planilla || !editable) return;
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
      const loaded = await loadMonthPlanilla(db, monthKey);
      setPlanilla(loaded);
      Alert.alert('Guardado', 'Planilla del mes actualizada.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [planilla, db, debts, refresh, refreshMonthIndex, editable]);

  if (!planilla || !totals || !shared) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: colors.textSecondary }}>Cargando planilla…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {!editable ? (
        <View style={[styles.closedBanner, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{monthEditabilityLabel(editMode)}</Text>
          <BodyText muted>
            {editMode === 'closed'
              ? 'Este mes ya quedó registrado. Solo puedes editar el mes actual.'
              : 'Todavía no puedes cargar meses futuros.'}
          </BodyText>
        </View>
      ) : null}

      <Card style={{ backgroundColor: colors.surfaceMuted, borderColor: colors.border }}>
        <SectionTitle>Fondo del mes</SectionTitle>
        <View style={styles.fundRow}>
          <Text style={{ color: colors.textSecondary }}>Fondo total (ingresos)</Text>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(totals.fundTotalClp)}</Text>
        </View>
        <View style={styles.fundRow}>
          <Text style={{ color: colors.textSecondary }}>Pagado hasta ahora</Text>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(totals.paidSoFarClp)}</Text>
        </View>
        <View style={styles.fundRow}>
          <Text style={{ color: colors.textSecondary }}>Disponible</Text>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>{formatClp(totals.availableClp)}</Text>
        </View>
        <View style={styles.fundRow}>
          <Text style={{ color: colors.textSecondary }}>Pendiente (sin pagar)</Text>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(totals.pendingOutflowsClp)}</Text>
        </View>
      </Card>

      <Card>
        <SectionTitle>Ingresos</SectionTitle>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Total del mes</Text>
        <ClpInput
          amountClp={planilla.incomeClp}
          onChangeAmount={(v) => setPlanilla(applyDiezmoToPlanilla({ ...planilla, incomeClp: v }))}
          editable={editable}
        />
      </Card>

      <Card>
        <SectionTitle>Gastos fijos</SectionTitle>
        {planilla.fixedLines.map((line, i) => (
          <EditableLineRow
            key={line.id}
            line={line}
            categoryLabelOnly
            readOnly={!editable}
            lockAmount={isDiezmoCategory(line.category)}
            amountHint={isDiezmoCategory(line.category) ? diezmoHintLabel(planilla.incomeClp) : undefined}
            onAmountChange={(v) => {
              if (isDiezmoCategory(line.category)) return;
              const fixedLines = [...planilla.fixedLines];
              fixedLines[i] = { ...line, amountClp: v };
              setPlanilla({ ...planilla, fixedLines });
            }}
            showPaidToggle
            onPaidChange={(paid) => {
              const fixedLines = [...planilla.fixedLines];
              fixedLines[i] = { ...line, paid };
              setPlanilla({ ...planilla, fixedLines });
            }}
            splitDivisor={lineSplitDivisor(planilla.sharedLineSplits ?? {}, line.id)}
          />
        ))}
        {editable ? (
          <Pressable onPress={() => router.push('/(tabs)/ajustes')} accessibilityRole="link">
            <Text style={[styles.link, { color: colors.primary }]}>
              Configurar ítems fijos en Ajustes
            </Text>
          </Pressable>
        ) : null}
        <BodyText muted>Total registrado: {formatClp(totals.totalFixedClp)}</BodyText>
      </Card>

      <Card>
        <SectionTitle>Gastos adicionales</SectionTitle>
        {planilla.additionalLines.length === 0 ? (
          <BodyText muted>Diezmo, comida, pagos a deudas, imprevistos…</BodyText>
        ) : null}
        {planilla.additionalLines.map((line, i) => (
          <EditableLineRow
            key={line.id}
            line={line}
            categoryEditable
            readOnly={!editable}
            onCategoryChange={(v) => {
              const additionalLines = [...planilla.additionalLines];
              additionalLines[i] = { ...line, category: v };
              setPlanilla({ ...planilla, additionalLines });
            }}
            onAmountChange={(v) => {
              const additionalLines = [...planilla.additionalLines];
              additionalLines[i] = { ...line, amountClp: v };
              setPlanilla({ ...planilla, additionalLines });
            }}
            onRemove={() =>
              setPlanilla({
                ...planilla,
                additionalLines: planilla.additionalLines.filter((_, idx) => idx !== i),
                sharedLineSplits: removeSplitForLine(line.id),
              })
            }
            showPaidToggle
            onPaidChange={(paid) => {
              const additionalLines = [...planilla.additionalLines];
              additionalLines[i] = { ...line, paid };
              setPlanilla({ ...planilla, additionalLines });
            }}
            splitDivisor={lineSplitDivisor(planilla.sharedLineSplits ?? {}, line.id)}
          />
        ))}
        {editable ? (
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
          <Text style={[styles.link, { color: colors.primary }]}>+ Agregar gasto adicional</Text>
        </Pressable>
        ) : null}
        <BodyText muted>Total registrado: {formatClp(totals.totalAdditionalClp)}</BodyText>
      </Card>

      {editable ? (
        <Card>
          <PlanillaDebtPayments
            db={db}
            monthKey={monthKey}
            planilla={planilla}
            activeDebts={activeDebts}
            persistPlanilla={persistPlanillaNow}
            persisting={debtPersisting}
          />
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Reserva</SectionTitle>
        <ClpInput
          amountClp={planilla.reserveClp}
          onChangeAmount={(v) => setPlanilla({ ...planilla, reserveClp: v })}
          editable={editable}
        />
      </Card>

      <AccordionSection title="Dividir cuentas">
            <BodyText muted>Cada ítem puede dividirse con su propio divisor (÷2, ÷3…). Afecta Pagado y Disponible.</BodyText>
            {splittableLines.length === 0 ? (
              <BodyText muted>Agrega montos en fijos o adicionales para poder dividirlos.</BodyText>
            ) : (
              splittableLines.map((line) => {
                const splits = planilla.sharedLineSplits ?? {};
                const on = lineSplitDivisor(splits, line.id) != null;
                const div = splits[line.id] ?? 2;
                return (
                  <View key={line.id} style={[styles.splitRow, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{line.category}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                        Total {formatClp(line.amountClp)}
                      </Text>
                    </View>
                    <Switch
                      value={on}
                      disabled={!editable}
                      onValueChange={(v) => toggleSharedLine(line.id, v)}
                      accessibilityLabel={`Dividir ${line.category}`}
                    />
                    {on ? (
                      <View style={styles.splitItemStepper}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>÷</Text>
                        <Pressable
                          disabled={!editable}
                          onPress={() => editable && setLineSplitDivisor(line.id, div - 1)}
                          style={[styles.stepBtnSmall, { borderColor: colors.border }]}>
                          <Text style={{ color: colors.text }}>−</Text>
                        </Pressable>
                        <Text style={[styles.stepValue, { color: colors.text, fontSize: 16 }]}>{div}</Text>
                        <Pressable
                          disabled={!editable}
                          onPress={() => editable && setLineSplitDivisor(line.id, div + 1)}
                          style={[styles.stepBtnSmall, { borderColor: colors.border }]}>
                          <Text style={{ color: colors.text }}>+</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
            <View style={[styles.splitSummary, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={{ color: colors.textSecondary }}>Total seleccionado</Text>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(shared.selectedTotalClp)}</Text>
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>Tu parte total</Text>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 18 }}>
                {formatClp(shared.yourPartClp)}
              </Text>
            </View>
      </AccordionSection>

      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
        <SectionTitle>Tu gasto del mes</SectionTitle>
        <MoneyText amountClp={totals.allOutflowsClp} large />
        <BodyText muted>Suma de tu parte en fijos/adicionales + hogar + deudas cargadas.</BodyText>
      </Card>

      <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
        <SectionTitle>Fondos menos gastos</SectionTitle>
        <MoneyText amountClp={totals.fondosMenosGastosClp} large />
        <BodyText muted>Ingresos − solo ítems marcados como pagados (disponible real).</BodyText>
        <View style={[styles.fundRow, { marginTop: spacing.sm }]}>
          <Text style={{ color: colors.textSecondary }}>Pendiente por pagar</Text>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(totals.pendingOutflowsClp)}</Text>
        </View>
        <View style={styles.fundRow}>
          <Text style={{ color: colors.textSecondary }}>Quedaría después de pagar todo</Text>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(totals.afterPayingAllClp)}</Text>
        </View>
        <BodyText muted>
          La reserva ({formatClp(planilla.reserveClp)}) se resta solo al cerrar todo, no entra en “pendiente”.
        </BodyText>
        {breakdown ? <PlanillaCalculationBreakdown breakdown={breakdown} /> : null}
      </Card>

      {editable ? (
      <Pressable
        disabled={saving}
        onPress={save}
        style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
        <Text style={styles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar planilla del mes'}</Text>
      </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  closedBanner: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: spacing.xs },
  lineCard: { marginBottom: spacing.sm, width: '100%', alignSelf: 'stretch' },
  lineMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
    alignSelf: 'stretch',
  },
  paidInline: { alignItems: 'center', gap: 0, minWidth: 56, flexShrink: 0 },
  categoryInputCompact: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryLabelBox: { justifyContent: 'center' },
  categoryLabelText: { fontSize: 14, fontWeight: '600' },
  amountCompact: { width: 118, minWidth: 118, flexShrink: 0 },
  lineHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  paidToggle: { alignItems: 'center', gap: 2 },
  fundRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  debtPayCard: { borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, gap: spacing.sm, marginBottom: spacing.sm },
  debtChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  debtChip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  kindRow: { flexDirection: 'row', gap: spacing.sm },
  kindBtn: { flex: 1, borderWidth: 1, borderRadius: radii.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  lineTitle: { fontSize: 15, fontWeight: '700' },
  categoryInput: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '600',
  },
  lineAmountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  removeBtn: { padding: spacing.sm },
  link: { fontWeight: '700', marginTop: spacing.xs, marginBottom: spacing.xs },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  splitSummary: { borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm, gap: 2 },
  splitItemStepper: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.xs },
  stepBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: { borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
