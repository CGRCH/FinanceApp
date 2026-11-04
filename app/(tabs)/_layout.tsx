import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useFinance } from '@/src/context/FinanceContext';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { spacing } from '@/src/theme/tokens';

export default function TabLayout() {
  const { effectiveScheme } = useFinance();
  const colorScheme = effectiveScheme;
  const insets = useSafeAreaInsets();
  const tabBarBottom = Math.max(insets.bottom, spacing.sm);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
        tabBarStyle: {
          backgroundColor: Colors[colorScheme].background,
          borderTopColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1',
          paddingBottom: tabBarBottom,
          paddingTop: spacing.xs,
          height: 52 + tabBarBottom,
        },
        headerStyle: { backgroundColor: Colors[colorScheme].background },
        headerTintColor: Colors[colorScheme].text,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="planilla"
        options={{
          title: 'Planilla',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'tablecells', android: 'grid_on', web: 'grid_on' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="historial"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="deudas"
        options={{
          title: 'Deudas',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="consejos"
        options={{
          title: 'Consejos',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'lightbulb', android: 'lightbulb', web: 'lightbulb' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
