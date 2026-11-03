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
import { BodyText, Card, MoneyText, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { isMonthEditable, monthEditability, monthEditabilityLabel } from '@/src/domain/monthEditability';
import { formatClp } from '@/src/domain/money';
import {
  computeMonthTotals,
  computeSharedSplitTotals,
  matchDebtIdForCategory,
  type DebtPaymentLine,
  type MonthPlanilla,
  type PlanillaLine,
} from '@/src/domain/monthPlanilla';
import { computePlanillaBreakdown } from '@/src/domain/planillaBreakdown';
import { PlanillaCalculationBreakdown } from '@/src/components/planilla/PlanillaCalculationBreakdown';
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
}: {
  line: PlanillaLine;
  onCategoryChange?: (v: string) => void;
  onAmountChange: (clp: number) => void;
  onRemove?: () => void;
  categoryEditable?: boolean;
  readOnly?: boolean;
  onPaidChange?: (paid: boolean) => void;
  showPaidToggle?: boolean;
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
        ) : (
          <Text style={[styles.lineTitle, { color: colors.text }]} numberOfLines={1}>
            {line.category}
          </Text>
        )}
        <ClpInput
          amountClp={line.amountClp}
          onChangeAmount={onAmountChange}
          style={styles.amountCompact}
          editable={!readOnly}
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
    </View>
  );
}

export function PlanillaEditor({ monthKey }: Props) {
  const db = useSQLiteContext();
  const { refresh, refreshMonthIndex } = useFinance();
  const colors = useThemeColors();
  const [planilla, setPlanilla] = useState<MonthPlanilla | null>(null);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMonthPlanilla(db, monthKey).then(setPlanilla);
    listDebts(db).then(setDebts);
  }, [db, monthKey]);

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
    const ids = new Set(planilla.sharedSplitLineIds);
    if (enabled) ids.add(lineId);
    else ids.delete(lineId);
    setPlanilla({ ...planilla, sharedSplitLineIds: [...ids] });
  };

  const splittableLines = useMemo(() => {
    if (!planilla) return [];
    return [...planilla.fixedLines, ...planilla.additionalLines].filter((l) => l.amountClp > 0);
  }, [planilla]);

  const activeDebts = useMemo(() => debts.filter((d) => d.balance_clp > 0), [debts]);

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
              ? 'Este mes ya quedó registrado. Solo podés editar el mes actual.'
              : 'Todavía no podés cargar meses futuros.'}
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
      </Card>

      <Card>
        <SectionTitle>Ingresos</SectionTitle>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Total del mes</Text>
        <ClpInput
          amountClp={planilla.incomeClp}
          onChangeAmount={(v) => setPlanilla({ ...planilla, incomeClp: v })}
          editable={editable}
        />
      </Card>

      <Card>
        <SectionTitle>Gastos fijos</SectionTitle>
        {planilla.fixedLines.map((line, i) => (
          <EditableLineRow
            key={line.id}
            line={line}
            categoryEditable
            readOnly={!editable}
            onCategoryChange={(v) => {
              const fixedLines = [...planilla.fixedLines];
              fixedLines[i] = { ...line, category: v };
              setPlanilla({ ...planilla, fixedLines });
            }}
            onAmountChange={(v) => {
              const fixedLines = [...planilla.fixedLines];
              fixedLines[i] = { ...line, amountClp: v };
              setPlanilla({ ...planilla, fixedLines });
            }}
            onRemove={
              planilla.fixedLines.length > 1
                ? () =>
                    setPlanilla({
                      ...planilla,
                      fixedLines: planilla.fixedLines.filter((_, idx) => idx !== i),
                      sharedSplitLineIds: planilla.sharedSplitLineIds.filter((id) => id !== line.id),
                    })
                : undefined
            }
            showPaidToggle
            onPaidChange={(paid) => {
              const fixedLines = [...planilla.fixedLines];
              fixedLines[i] = { ...line, paid };
              setPlanilla({ ...planilla, fixedLines });
            }}
          />
        ))}
        {editable ? (
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
          <Text style={[styles.link, { color: colors.primary }]}>+ Agregar ítem fijo</Text>
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
                sharedSplitLineIds: planilla.sharedSplitLineIds.filter((id) => id !== line.id),
              })
            }
            showPaidToggle
            onPaidChange={(paid) => {
              const additionalLines = [...planilla.additionalLines];
              additionalLines[i] = { ...line, paid };
              setPlanilla({ ...planilla, additionalLines });
            }}
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
        <Card>
          <SectionTitle>Pagos de deudas</SectionTitle>
          <BodyText muted>Elegí deuda, pago total o abono parcial. El saldo de la deuda baja solo si marcás Pagado y guardás.</BodyText>
          {planilla.debtPaymentLines.map((line, i) => {
            const debt = debts.find((d) => d.id === line.debtId);
            return (
              <View key={line.id} style={[styles.debtPayCard, { borderColor: colors.border }]}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Deuda</Text>
                <View style={styles.debtChipRow}>
                  {activeDebts.map((d) => (
                    <Pressable
                      key={d.id}
                      onPress={() => {
                        const debtPaymentLines = [...planilla.debtPaymentLines];
                        debtPaymentLines[i] = {
                          ...line,
                          debtId: d.id,
                          amountClp: line.paymentKind === 'full' ? d.balance_clp : line.amountClp,
                        };
                        setPlanilla({ ...planilla, debtPaymentLines });
                      }}
                      style={[
                        styles.debtChip,
                        {
                          borderColor: line.debtId === d.id ? colors.primary : colors.border,
                          backgroundColor: line.debtId === d.id ? colors.primarySoft : colors.surface,
                        },
                      ]}>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{d.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{debt?.name ?? 'Elegí deuda'}</Text>
                <View style={styles.kindRow}>
                  <Pressable
                    onPress={() => {
                      const debtPaymentLines = [...planilla.debtPaymentLines];
                      debtPaymentLines[i] = { ...line, paymentKind: 'full', amountClp: debt?.balance_clp ?? 0 };
                      setPlanilla({ ...planilla, debtPaymentLines });
                    }}
                    style={[
                      styles.kindBtn,
                      line.paymentKind === 'full' && { backgroundColor: colors.primarySoft, borderColor: colors.primary },
                      { borderColor: colors.border },
                    ]}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Pago total</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const debtPaymentLines = [...planilla.debtPaymentLines];
                      debtPaymentLines[i] = { ...line, paymentKind: 'partial' };
                      setPlanilla({ ...planilla, debtPaymentLines });
                    }}
                    style={[
                      styles.kindBtn,
                      line.paymentKind === 'partial' && { backgroundColor: colors.primarySoft, borderColor: colors.primary },
                      { borderColor: colors.border },
                    ]}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Abono</Text>
                  </Pressable>
                </View>
                {line.paymentKind === 'partial' ? (
                  <ClpInput
                    amountClp={line.amountClp}
                    onChangeAmount={(v) => {
                      const debtPaymentLines = [...planilla.debtPaymentLines];
                      debtPaymentLines[i] = { ...line, amountClp: v };
                      setPlanilla({ ...planilla, debtPaymentLines });
                    }}
                  />
                ) : (
                  <BodyText muted>Se pagará el saldo restante ({formatClp(debt?.balance_clp ?? 0)})</BodyText>
                )}
                <View style={styles.paidToggle}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>Pagado</Text>
                  <Switch
                    value={!!line.paid}
                    onValueChange={(paid) => {
                      const debtPaymentLines = [...planilla.debtPaymentLines];
                      debtPaymentLines[i] = { ...line, paid };
                      setPlanilla({ ...planilla, debtPaymentLines });
                    }}
                  />
                </View>
                <Pressable
                  onPress={() =>
                    setPlanilla({
                      ...planilla,
                      debtPaymentLines: planilla.debtPaymentLines.filter((_, idx) => idx !== i),
                    })
                  }>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>Quitar pago</Text>
                </Pressable>
              </View>
            );
          })}
          {activeDebts.length === 0 ? (
            <BodyText muted>No hay deudas activas. Creá una en la pestaña Deudas.</BodyText>
          ) : (
            <Pressable
              onPress={() => {
                const first = activeDebts[0];
                const entry: DebtPaymentLine = {
                  id: `dp-${Date.now()}`,
                  debtId: first.id,
                  paymentKind: 'partial',
                  amountClp: first.minimum_payment_clp,
                  paid: false,
                };
                setPlanilla({ ...planilla, debtPaymentLines: [...planilla.debtPaymentLines, entry] });
              }}>
              <Text style={[styles.link, { color: colors.primary }]}>+ Agregar pago de deuda</Text>
            </Pressable>
          )}
          {activeDebts.length > 1 && planilla.debtPaymentLines.length > 0 ? (
            <BodyText muted>Tip: editá la deuda del pago tocando Deudas si necesitás cambiar cuál abonás.</BodyText>
          ) : null}
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

      <Card>
        <SectionTitle>Dividir cuentas</SectionTitle>
        <BodyText muted>Elegí qué ítems ya ingresados se reparten y entre cuántas personas.</BodyText>
        <View style={styles.stepperRow}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Personas</Text>
          <View style={styles.stepper}>
            <Pressable
              disabled={!editable}
              onPress={() =>
                editable &&
                setPlanilla({
                  ...planilla,
                  sharedSplitPeople: Math.max(2, planilla.sharedSplitPeople - 1),
                })
              }
              style={[styles.stepBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 20 }}>−</Text>
            </Pressable>
            <Text style={[styles.stepValue, { color: colors.text }]}>{planilla.sharedSplitPeople}</Text>
            <Pressable
              disabled={!editable}
              onPress={() =>
                editable && setPlanilla({ ...planilla, sharedSplitPeople: planilla.sharedSplitPeople + 1 })
              }
              style={[styles.stepBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 20 }}>+</Text>
            </Pressable>
          </View>
        </View>
        {splittableLines.length === 0 ? (
          <BodyText muted>Agregá montos en fijos o adicionales para poder dividirlos.</BodyText>
        ) : (
          splittableLines.map((line) => {
            const on = planilla.sharedSplitLineIds.includes(line.id);
            return (
              <View key={line.id} style={[styles.splitRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{line.category}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{formatClp(line.amountClp)}</Text>
                </View>
                <Switch
                  value={on}
                  disabled={!editable}
                  onValueChange={(v) => toggleSharedLine(line.id, v)}
                  accessibilityLabel={`Dividir ${line.category}`}
                />
              </View>
            );
          })
        )}
        <View style={[styles.splitSummary, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={{ color: colors.textSecondary }}>Total seleccionado</Text>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(shared.selectedTotalClp)}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>Tu parte</Text>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 18 }}>
            {formatClp(shared.yourPartClp)}
          </Text>
        </View>
      </Card>

      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
        <SectionTitle>Tu gasto del mes</SectionTitle>
        <MoneyText amountClp={totals.allOutflowsClp} large />
        <BodyText muted>Incluye divisiones de cuentas. Después de reserva: {formatClp(totals.surplusAfterReserveClp)}</BodyText>
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
  lineCard: { marginBottom: spacing.sm },
  lineMainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  paidInline: { alignItems: 'center', gap: 0, minWidth: 56 },
  categoryInputCompact: {
    flex: 1,
    minWidth: 72,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  amountCompact: { width: 118, minWidth: 118 },
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
  saveBtn: { borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
