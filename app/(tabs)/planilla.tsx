import { View, StyleSheet } from 'react-native';

import { MonthNavigator } from '@/src/components/planilla/MonthNavigator';
import { PlanillaEditor } from '@/src/components/planilla/PlanillaEditor';
import { useFinance } from '@/src/context/FinanceContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export default function PlanillaScreen() {
  const { monthKey, setMonthKey } = useFinance();
  const colors = useThemeColors();

  return (
    <View style={StyleSheet.flatten([styles.root, { backgroundColor: colors.background }])}>
      <MonthNavigator monthKey={monthKey} onMonthChange={setMonthKey} />
      <PlanillaEditor monthKey={monthKey} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
