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
import {
  computeMonthTotals,
  computeSharedSplitTotals,
  matchDebtIdForCategory,
  type MonthPlanilla,
  type PlanillaLine,
} from '@/src/domain/monthPlanilla';
import { formatClp } from '@/src/domain/money';
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
}: {
  line: PlanillaLine;
  onCategoryChange?: (v: string) => void;
  onAmountChange: (clp: number) => void;
  onRemove?: () => void;
  categoryEditable?: boolean;
  readOnly?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.lineCard}>
      {categoryEditable && !readOnly ? (
        <TextInput
          value={line.category}
          onChangeText={onCategoryChange}
          editable={!readOnly}
          placeholder="Nombre del ítem"
          placeholderTextColor={colors.textSecondary}
          style={[styles.categoryInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
      ) : (
        <Text style={[styles.lineTitle, { color: colors.text }]}>{line.category}</Text>
      )}
      <View style={styles.lineAmountRow}>
        <ClpInput amountClp={line.amountClp} onChangeAmount={onAmountChange} style={{ flex: 1 }} editable={!readOnly} />
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

  const totals = useMemo(() => (planilla ? computeMonthTotals(planilla) : null), [planilla]);
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
        <BodyText muted>Ingresos − fijos − adicionales (como tu Excel).</BodyText>
      </Card>

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
  lineCard: { marginBottom: spacing.sm, gap: spacing.xs },
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
