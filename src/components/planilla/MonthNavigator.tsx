import { Pressable, StyleSheet, Text, View } from 'react-native';

import { monthKeyToLabel, shiftMonthKey } from '@/src/domain/monthPlanilla';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

interface Props {
  monthKey: string;
  onMonthChange: (key: string) => void;
}

export function MonthNavigator({ monthKey, onMonthChange }: Props) {
  const colors = useThemeColors();
  const label = monthKeyToLabel(monthKey);

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mes anterior"
        onPress={() => onMonthChange(shiftMonthKey(monthKey, -1))}
        style={styles.arrowBtn}>
        <Text style={[styles.arrow, { color: colors.primary }]}>{'‹'}</Text>
      </Pressable>
      <View style={styles.center}>
        <Text style={[styles.label, { color: colors.text }]} accessibilityRole="header">
          {label}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mes siguiente"
        onPress={() => onMonthChange(shiftMonthKey(monthKey, 1))}
        style={styles.arrowBtn}>
        <Text style={[styles.arrow, { color: colors.primary }]}>{'›'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    minHeight: 48,
    maxHeight: 48,
  },
  arrowBtn: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { fontSize: 28, fontWeight: '300', lineHeight: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
});
