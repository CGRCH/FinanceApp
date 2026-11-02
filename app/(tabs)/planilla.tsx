import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlanillaEditor } from '@/src/components/planilla/PlanillaEditor';
import { BodyText } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { monthKeyToLabel } from '@/src/domain/monthPlanilla';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';

export default function PlanillaScreen() {
  const { monthKey, setMonthKey, monthKeys } = useFinance();
  const colors = useThemeColors();

  return (
    <View style={StyleSheet.flatten([styles.root, { backgroundColor: colors.background }])}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthStrip}>
        {[monthKey, ...monthKeys.filter((k) => k !== monthKey)].filter((v, i, a) => a.indexOf(v) === i).map((key) => {
          const active = key === monthKey;
          return (
            <Pressable
              key={key}
              onPress={() => setMonthKey(key)}
              style={[
                styles.monthChip,
                {
                  backgroundColor: active ? colors.primarySoft : colors.surfaceMuted,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}>
              <Text style={{ color: colors.text, fontWeight: active ? '800' : '500', fontSize: 13 }}>
                {monthKeyToLabel(key)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            const now = new Date();
            const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            setMonthKey(mk);
          }}
          style={[styles.monthChip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>+ Mes actual</Text>
        </Pressable>
      </ScrollView>
      {monthKeys.length === 0 ? (
        <View style={{ paddingHorizontal: spacing.md }}>
          <BodyText muted>Completá la planilla y guardá. Podés sumar más meses desde Historial o importando Excel.</BodyText>
        </View>
      ) : null}
      <PlanillaEditor monthKey={monthKey} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  monthStrip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  monthChip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
