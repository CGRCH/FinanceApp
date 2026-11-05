import { MonthNavigator } from '@/src/components/planilla/MonthNavigator';
import { PlanillaEditor } from '@/src/components/planilla/PlanillaEditor';
import { SafeScreen } from '@/src/components/ui/SafeScreen';
import { useFinance } from '@/src/context/FinanceContext';

export default function PlanillaScreen() {
  const { monthKey, setMonthKey } = useFinance();

  return (
    <SafeScreen>
      <MonthNavigator monthKey={monthKey} onMonthChange={setMonthKey} enableSwipe />
      <PlanillaEditor monthKey={monthKey} />
    </SafeScreen>
  );
}
