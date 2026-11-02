export interface MonthComparePoint {
  monthKey: string;
  label: string;
  incomeClp: number;
  expensesClp: number;
  reserveClp: number;
  fondosMenosGastosClp: number;
}

export function sortMonthKeys(keys: string[]): string[] {
  return [...keys].sort();
}
