import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { MonthHistoryCard } from '@/src/components/historial/MonthHistoryCard';
import { MonthNavigator } from '@/src/components/planilla/MonthNavigator';
import { BodyText, Card, MoneyText, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { formatClp } from '@/src/domain/money';
import { isMonthEditable, monthEditability, monthEditabilityLabel } from '@/src/domain/monthEditability';
import { computeMonthTotals, monthKeyToLabel } from '@/src/domain/monthPlanilla';
import { loadMonthPlanilla } from '@/src/db/repository';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

export default function HistorialScreen() {
  const { comparePoints, setMonthKey, monthKey } = useFinance();
  const colors = useThemeColors();
  const db = useSQLiteContext();
  const [viewMonthKey, setViewMonthKey] = useState(monthKey);
  const [detailTotals, setDetailTotals] = useState<ReturnType<typeof computeMonthTotals> | null>(null);

  useEffect(() => {
    loadMonthPlanilla(db, viewMonthKey).then((p) => setDetailTotals(computeMonthTotals(p)));
  }, [db, viewMonthKey]);

  const maxIncome = Math.max(...comparePoints.map((p) => p.incomeClp), 1);
  const ordered = useMemo(() => [...comparePoints].reverse(), [comparePoints]);
  const viewPoint = comparePoints.find((p) => p.monthKey === viewMonthKey);
  const editMode = monthEditability(viewMonthKey);
  const canEditPlanilla = isMonthEditable(viewMonthKey);

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Historial</Text>
      <BodyText muted>Resumen de meses guardados y detalle mes a mes con las flechas.</BodyText>

      {comparePoints.length > 0 ? (
        <>
          <SectionTitle>Resumen</SectionTitle>
          {ordered.map((p) => (
            <MonthHistoryCard
              key={p.monthKey}
              point={p}
              maxIncome={maxIncome}
              selected={viewMonthKey === p.monthKey}
              onPress={() => setViewMonthKey(p.monthKey)}
            />
          ))}
        </>
      ) : (
        <Card>
          <BodyText muted>Todavía no hay meses guardados. Completá tu planilla o importá Excel.</BodyText>
        </Card>
      )}

      <SectionTitle>Detalle del mes</SectionTitle>
      <MonthNavigator monthKey={viewMonthKey} onMonthChange={setViewMonthKey} enableSwipe />

      {editMode !== 'editable' ? (
        <View style={[styles.badge, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>{monthEditabilityLabel(editMode)}</Text>
        </View>
      ) : null}

      {detailTotals ? (
        <Card>
          {viewPoint ? (
            <MonthHistoryCard point={viewPoint} maxIncome={maxIncome} selected />
          ) : (
            <>
              <SectionTitle>{monthKeyToLabel(viewMonthKey)}</SectionTitle>
              <BodyText muted>
                Sin datos guardados para este mes.{' '}
                {canEditPlanilla ? 'Completalo en Planilla.' : 'Solo el mes actual se puede editar.'}
              </BodyText>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Fondos menos gastos</Text>
                <MoneyText amountClp={detailTotals.fondosMenosGastosClp} />
              </View>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Tu gasto (con divisiones)</Text>
                <MoneyText amountClp={-detailTotals.allOutflowsClp} />
              </View>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Reserva</Text>
                <MoneyText amountClp={detailTotals.reserveClp} />
              </View>
              <BodyText muted>Después de reserva: {formatClp(detailTotals.surplusAfterReserveClp)}</BodyText>
            </>
          )}

          <Pressable
            style={[styles.openBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setMonthKey(viewMonthKey);
              router.push('/(tabs)/planilla');
            }}>
            <Text style={styles.openBtnText}>
              {canEditPlanilla ? 'Editar en planilla' : 'Ver en planilla'}
            </Text>
          </Pressable>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: '800' },
  badge: {
    marginHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  openBtn: { marginTop: spacing.md, borderRadius: 12, paddingVertical: spacing.sm, alignItems: 'center' },
  openBtnText: { color: '#fff', fontWeight: '700' },
});
