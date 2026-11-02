import { Platform, View } from 'react-native';
import { CartesianChart, Bar } from 'victory-native';

import { useThemeColors } from '@/src/hooks/useThemeColors';

interface Props {
  income: number;
  fixed: number;
  additional: number;
  shared: number;
}

export function ExpenseBreakdownChart({ income, fixed, additional, shared }: Props) {
  const colors = useThemeColors();
  if (Platform.OS === 'web') {
    return null;
  }
  const data = [
    { category: 'Fijos', amount: fixed, color: colors.chart[0] },
    { category: 'Extra', amount: additional, color: colors.chart[1] },
    { category: 'Comp.', amount: shared, color: colors.chart[2] },
  ].filter((d) => d.amount > 0);

  if (data.length === 0) {
    return null;
  }

  return (
    <View style={{ height: 180 }}>
      <CartesianChart
        data={data}
        xKey="category"
        yKeys={['amount']}
        domainPadding={{ left: 24, right: 24, top: 12 }}>
        {({ points, chartBounds }) => (
          <Bar
            points={points.amount}
            chartBounds={chartBounds}
            color={colors.primary}
            roundedCorners={{ topLeft: 6, topRight: 6 }}
          />
        )}
      </CartesianChart>
    </View>
  );
}
