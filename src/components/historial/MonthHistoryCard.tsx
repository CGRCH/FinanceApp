import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatClp } from '@/src/domain/money';
import type { MonthComparePoint } from '@/src/domain/monthCompare';
import { monthKeyToLabel } from '@/src/domain/monthPlanilla';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

interface Props {
  point: MonthComparePoint;
  maxIncome: number;
  selected?: boolean;
  onPress?: () => void;
}

export function MonthHistoryCard({ point, maxIncome, selected, onPress }: Props) {
  const colors = useThemeColors();
  const saldo = point.fondosMenosGastosClp - point.reserveClp;
  const saldoTone = saldo >= 0 ? colors.primary : colors.danger;
  const incomeW = Math.max(8, Math.round((point.incomeClp / maxIncome) * 100));
  const expenseW = Math.max(4, Math.round((point.expensesClp / maxIncome) * 100));

  const inner = (
    <>
      <View style={styles.header}>
        <Text style={[styles.month, { color: colors.text }]}>{monthKeyToLabel(point.monthKey)}</Text>
        <View style={[styles.badge, { backgroundColor: saldo >= 0 ? colors.primarySoft : colors.dangerSoft }]}>
          <Text style={{ color: saldoTone, fontWeight: '800', fontSize: 12 }}>
            {saldo >= 0 ? 'Al día' : 'Apretado'}
          </Text>
        </View>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.barIncome, { width: `${incomeW}%`, backgroundColor: colors.primary }]} />
        <View style={[styles.barExpense, { width: `${expenseW}%`, backgroundColor: colors.accent }]} />
      </View>

      <View style={styles.grid}>
        <Metric label="Ingresos" value={formatClp(point.incomeClp)} colors={colors} />
        <Metric label="Tu gasto" value={formatClp(point.expensesClp)} colors={colors} />
        <Metric label="Reserva" value={formatClp(point.reserveClp)} colors={colors} />
        <Metric label="Saldo est." value={formatClp(saldo)} colors={colors} highlight={saldoTone} />
      </View>
    </>
  );

  const cardStyle = [
    styles.card,
    {
      backgroundColor: selected ? colors.primarySoft : colors.surface,
      borderColor: selected ? colors.primary : colors.border,
    },
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={cardStyle}>
        {inner}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{inner}</View>;
}

function Metric({
  label,
  value,
  colors,
  highlight,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeColors>;
  highlight?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: highlight ?? colors.text, fontWeight: '800', fontSize: 14 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { fontSize: 17, fontWeight: '800', textTransform: 'capitalize', flex: 1 },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  barIncome: { height: 8 },
  barExpense: { height: 8, opacity: 0.9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { width: '47%', gap: 2 },
});
