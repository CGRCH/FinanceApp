import { View, StyleSheet, Text } from 'react-native';

import { BodyText } from '@/src/components/ui/Primitives';
import type { HomeDistributionSlice } from '@/src/domain/homeDashboard';
import { formatClp } from '@/src/domain/money';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';

interface Props {
  slices: HomeDistributionSlice[];
  incomeClp: number;
  hasData: boolean;
}

export function MonthDistributionChart({ slices, incomeClp, hasData }: Props) {
  const colors = useThemeColors();
  const palette: Record<string, string> = {
    fixed: colors.chart[0],
    diezmo: colors.chart[3],
    additional: colors.chart[1],
    debt: colors.chart[2],
    available: colors.primary,
  };

  const visible = slices.filter((s) => s.amountClp > 0);
  if (!hasData) {
    return (
      <BodyText muted>
        Aún no hay ingresos ni gastos este mes. Registra tu planilla para ver la distribución.
      </BodyText>
    );
  }

  const barTotal = Math.max(incomeClp, visible.reduce((sum, s) => sum + s.amountClp, 0), 1);

  return (
    <View style={styles.wrap}>
      <View style={[styles.donutTrack, { backgroundColor: colors.surfaceMuted }]}>
        {visible.map((slice) => (
          <View
            key={slice.id}
            style={{
              flex: slice.amountClp,
              backgroundColor: palette[slice.id] ?? colors.primary,
              minWidth: slice.amountClp > 0 ? 4 : 0,
            }}
          />
        ))}
      </View>
      {visible.map((slice) => (
        <View key={`row-${slice.id}`} style={styles.row}>
          <View style={styles.rowLabel}>
            <View style={[styles.dot, { backgroundColor: palette[slice.id] ?? colors.primary }]} />
            <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{slice.label}</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{formatClp(slice.amountClp)}</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={{
                width: `${Math.min(100, (slice.amountClp / barTotal) * 100)}%`,
                backgroundColor: palette[slice.id] ?? colors.primary,
                height: '100%',
                borderRadius: radii.sm,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  donutTrack: {
    flexDirection: 'row',
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  row: { gap: 4 },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  barTrack: { height: 8, borderRadius: radii.sm, overflow: 'hidden' },
});
